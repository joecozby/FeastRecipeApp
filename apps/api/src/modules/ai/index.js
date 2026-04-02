import { Router } from 'express'
import { body } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'
import { normalizeIngredient } from '../../services/ingredientNormalizer.js'
import { enqueueNutrition } from '../../workers/nutritionWorker.js'
import { getOrCreateList, rebuildGroceryItems } from '../../services/groceryService.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// Claude tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'create_recipe',
    description: "Create a new recipe and save it to the user's Feast account. Use this whenever the user asks you to create, generate, or add a recipe.",
    input_schema: {
      type: 'object',
      properties: {
        title:           { type: 'string' },
        description:     { type: 'string' },
        cuisine:         { type: 'string' },
        difficulty:      { type: 'string', enum: ['easy', 'medium', 'hard'] },
        prep_time_mins:  { type: 'number' },
        cook_time_mins:  { type: 'number' },
        base_servings:   { type: 'integer' },
        ingredients: {
          type: 'array',
          description: 'Each ingredient as raw text with an amount, e.g. "2 cups flour"',
          items: {
            type: 'object',
            properties: {
              raw_text:    { type: 'string' },
              group_label: { type: 'string', description: 'Optional section heading, e.g. "For the sauce"' },
            },
            required: ['raw_text'],
          },
        },
        instructions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              body:        { type: 'string' },
              group_label: { type: 'string' },
            },
            required: ['body'],
          },
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'e.g. ["dinner","vegetarian"]' },
      },
      required: ['title', 'ingredients', 'instructions'],
    },
  },
  {
    name: 'edit_recipe',
    description: "Edit an existing recipe in the user's Feast account. Pass only the fields you want to change. Providing ingredients or instructions replaces them entirely.",
    input_schema: {
      type: 'object',
      properties: {
        recipe_id:       { type: 'string', description: 'UUID of the recipe to edit' },
        title:           { type: 'string' },
        description:     { type: 'string' },
        cuisine:         { type: 'string' },
        difficulty:      { type: 'string', enum: ['easy', 'medium', 'hard'] },
        prep_time_mins:  { type: 'number' },
        cook_time_mins:  { type: 'number' },
        base_servings:   { type: 'integer' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: { raw_text: { type: 'string' }, group_label: { type: 'string' } },
            required: ['raw_text'],
          },
        },
        instructions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { body: { type: 'string' }, group_label: { type: 'string' } },
            required: ['body'],
          },
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['recipe_id'],
    },
  },
  {
    name: 'add_to_grocery_list',
    description: "Add one or more recipes to the user's grocery list. Ingredient quantities are automatically merged and scaled across all recipes on the list. Use this when the user asks to add recipes to their grocery list or shopping list.",
    input_schema: {
      type: 'object',
      properties: {
        recipe_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'UUIDs of the recipes to add to the grocery list',
        },
      },
      required: ['recipe_ids'],
    },
  },
  {
    name: 'remove_from_grocery_list',
    description: "Remove one or more recipes from the user's grocery list.",
    input_schema: {
      type: 'object',
      properties: {
        recipe_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'UUIDs of the recipes to remove from the grocery list',
        },
      },
      required: ['recipe_ids'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function executeCreateRecipe(input, userId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [recipe] } = await client.query(
      `INSERT INTO recipes
         (owner_id, title, description, cuisine, difficulty, prep_time_mins, cook_time_mins, base_servings, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id`,
      [userId, input.title, input.description ?? null, input.cuisine ?? null,
       input.difficulty ?? null, input.prep_time_mins ?? null,
       input.cook_time_mins ?? null, input.base_servings ?? null]
    )
    const recipeId = recipe.id

    for (let i = 0; i < (input.ingredients ?? []).length; i++) {
      const ing = input.ingredients[i]
      const norm = await normalizeIngredient(ing.raw_text)
      await client.query(
        `INSERT INTO recipe_ingredients
           (recipe_id, ingredient_id, raw_text, quantity, unit, preparation, notes, is_optional, display_order, group_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [recipeId, norm.ingredient_id ?? null, norm.raw_text,
         norm.quantity ?? null, norm.unit ?? null,
         norm.preparation ?? null, norm.notes ?? null,
         false, i, ing.group_label ?? null]
      )
    }

    for (let i = 0; i < (input.instructions ?? []).length; i++) {
      const step = input.instructions[i]
      await client.query(
        `INSERT INTO instructions (recipe_id, step_number, body, group_label) VALUES ($1,$2,$3,$4)`,
        [recipeId, i + 1, step.body, step.group_label ?? null]
      )
    }

    for (const tagName of (input.tags ?? [])) {
      const { rows: [tag] } = await client.query(
        `INSERT INTO tags (name) VALUES (lower($1))
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [String(tagName)]
      )
      await client.query(
        `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [recipeId, tag.id]
      )
    }

    await client.query('COMMIT')
    return recipeId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function executeEditRecipe(input, userId) {
  const { recipe_id, ingredients, instructions, tags, ...meta } = input

  const { rows: [existing] } = await pool.query(
    `SELECT id FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [recipe_id, userId]
  )
  if (!existing) throw new Error('Recipe not found or not owned by user')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const allowed = ['title', 'description', 'cuisine', 'difficulty', 'prep_time_mins', 'cook_time_mins', 'base_servings']
    const updates = []
    const params = []
    for (const key of allowed) {
      if (meta[key] !== undefined) {
        params.push(meta[key])
        updates.push(`${key} = $${params.length}`)
      }
    }
    if (updates.length) {
      params.push(recipe_id)
      await client.query(
        `UPDATE recipes SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
        params
      )
    }

    if (ingredients) {
      await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipe_id])
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i]
        const norm = await normalizeIngredient(ing.raw_text)
        await client.query(
          `INSERT INTO recipe_ingredients
             (recipe_id, ingredient_id, raw_text, quantity, unit, preparation, notes, is_optional, display_order, group_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [recipe_id, norm.ingredient_id ?? null, norm.raw_text,
           norm.quantity ?? null, norm.unit ?? null,
           norm.preparation ?? null, norm.notes ?? null,
           false, i, ing.group_label ?? null]
        )
      }
    }

    if (instructions) {
      await client.query(`DELETE FROM instructions WHERE recipe_id = $1`, [recipe_id])
      for (let i = 0; i < instructions.length; i++) {
        const step = instructions[i]
        await client.query(
          `INSERT INTO instructions (recipe_id, step_number, body, group_label) VALUES ($1,$2,$3,$4)`,
          [recipe_id, i + 1, step.body, step.group_label ?? null]
        )
      }
    }

    if (tags) {
      await client.query(`DELETE FROM recipe_tags WHERE recipe_id = $1`, [recipe_id])
      for (const tagName of tags) {
        const { rows: [tag] } = await client.query(
          `INSERT INTO tags (name) VALUES (lower($1))
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [String(tagName)]
        )
        await client.query(
          `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [recipe_id, tag.id]
        )
      }
    }

    await client.query('COMMIT')
    return recipe_id
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function executeAddToGroceryList(input, userId) {
  const { recipe_ids } = input
  const listId = await getOrCreateList(userId)
  const added = []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const recipeId of recipe_ids) {
      // Verify this recipe belongs to the user
      const { rows: [recipe] } = await client.query(
        `SELECT id, base_servings FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [recipeId, userId]
      )
      if (!recipe) continue // skip unknown/unauthorized ids

      await client.query(
        `INSERT INTO grocery_list_recipes (grocery_list_id, recipe_id, servings)
         VALUES ($1,$2,$3)
         ON CONFLICT (grocery_list_id, recipe_id) DO UPDATE SET servings = EXCLUDED.servings`,
        [listId, recipeId, recipe.base_servings]
      )
      added.push(recipeId)
    }

    if (added.length > 0) await rebuildGroceryItems(listId, client)
    await client.query('COMMIT')
    return { success: true, added_count: added.length, grocery_list_id: listId }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function executeRemoveFromGroceryList(input, userId) {
  const { recipe_ids } = input
  const listId = await getOrCreateList(userId)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const recipeId of recipe_ids) {
      await client.query(
        `DELETE FROM grocery_list_recipes WHERE grocery_list_id = $1 AND recipe_id = $2`,
        [listId, recipeId]
      )
    }
    await rebuildGroceryItems(listId, client)
    await client.query('COMMIT')
    return { success: true, removed_count: recipe_ids.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Build rich context for the system prompt
// ---------------------------------------------------------------------------

async function buildUserContext(userId) {
  // Recipes (lightweight — for reference in tool calls)
  const { rows: userRecipes } = await pool.query(
    `SELECT id, title, cuisine, difficulty FROM recipes
     WHERE owner_id = $1 AND deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  )

  // Cookbooks with their recipes
  const { rows: cookbooks } = await pool.query(
    `SELECT c.id, c.title,
            json_agg(
              json_build_object(
                'id',         r.id,
                'title',      r.title,
                'cuisine',    r.cuisine,
                'difficulty', r.difficulty,
                'prep_time_mins', r.prep_time_mins,
                'cook_time_mins', r.cook_time_mins
              ) ORDER BY cr.display_order, cr.added_at
            ) FILTER (WHERE r.id IS NOT NULL) AS recipes
     FROM cookbooks c
     LEFT JOIN cookbook_recipes cr ON cr.cookbook_id = c.id
     LEFT JOIN recipes r ON r.id = cr.recipe_id AND r.deleted_at IS NULL
     WHERE c.owner_id = $1 AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.display_order, c.created_at`,
    [userId]
  )

  // Current grocery list recipes
  const { rows: groceryRecipes } = await pool.query(
    `SELECT r.id, r.title
     FROM grocery_list_recipes glr
     JOIN grocery_lists gl ON gl.id = glr.grocery_list_id
     JOIN recipes r ON r.id = glr.recipe_id AND r.deleted_at IS NULL
     WHERE gl.user_id = $1
     ORDER BY glr.added_at`,
    [userId]
  )

  // Format recipe list
  const recipeListText = userRecipes.length
    ? userRecipes.map(r =>
        `- ${r.title} (id: ${r.id})${r.cuisine ? `, ${r.cuisine}` : ''}${r.difficulty ? `, ${r.difficulty}` : ''}`
      ).join('\n')
    : 'No recipes yet.'

  // Format cookbooks
  const cookbookText = cookbooks.length
    ? cookbooks.map(cb => {
        const recipes = (cb.recipes ?? [])
        const recipeLines = recipes.length
          ? recipes.map(r => {
              const meta = [r.cuisine, r.difficulty, r.cook_time_mins ? `${r.cook_time_mins} min` : null]
                .filter(Boolean).join(', ')
              return `    • ${r.title} (id: ${r.id}${meta ? ', ' + meta : ''})`
            }).join('\n')
          : '    (empty)'
        return `- "${cb.title}" (id: ${cb.id}):\n${recipeLines}`
      }).join('\n')
    : 'No cookbooks yet.'

  // Format grocery list
  const groceryText = groceryRecipes.length
    ? groceryRecipes.map(r => `- ${r.title} (id: ${r.id})`).join('\n')
    : 'No recipes on the grocery list yet.'

  return { recipeListText, cookbookText, groceryText }
}

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

router.post(
  '/chat',
  [
    body('message').trim().notEmpty().withMessage('message is required'),
    body('history').optional({ nullable: true }).isArray(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { ANTHROPIC_API_KEY } = process.env
    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'sk-ant-stub') {
      return res.json({
        reply: "AI features require a real Anthropic API key. Set ANTHROPIC_API_KEY in your Railway API service variables.",
        created_recipe_id: null,
        updated_recipe_id: null,
        grocery_updated: false,
      })
    }

    const { message, history = [] } = req.body
    const userId = req.user.sub

    const { recipeListText, cookbookText, groceryText } = await buildUserContext(userId)

    const systemPrompt = `You are an AI cooking assistant built into Feast, a personal recipe organizer. You help users with:
- Answering cooking questions and giving culinary advice
- Suggesting recipes and creative variations
- Recommending ingredient substitutions
- Creating new recipes and saving them to their account (use the create_recipe tool)
- Editing existing recipes (use the edit_recipe tool)
- Adding or removing recipes from their grocery list (use add_to_grocery_list / remove_from_grocery_list)
- Picking recipes from a specific cookbook and adding them to the grocery list

The user's recipes:
${recipeListText}

The user's cookbooks (use these when they mention a cookbook by name):
${cookbookText}

Recipes currently on the grocery list:
${groceryText}

Rules:
- When asked to create a recipe, ALWAYS use the create_recipe tool — never just describe it in text.
- When asked to add recipes to the grocery list, use their exact recipe ids from the context above.
- When asked to pick recipes from a cookbook, find the cookbook by name in the list above, choose recipes from it, then call add_to_grocery_list with those recipe ids.
- After adding to the grocery list, tell the user which recipes were added.
- You can call multiple tools in sequence within one response (e.g. pick recipes then add them).`

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    let createdRecipeId = null
    let updatedRecipeId = null
    let groceryUpdated = false
    let finalReply = ''

    let currentMessages = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    // Agentic loop: handle tool calls until end_turn
    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      })

      if (response.stop_reason === 'end_turn') {
        finalReply = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('')
        break
      }

      if (response.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: response.content })

        const toolResults = []
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          let result
          try {
            if (block.name === 'create_recipe') {
              const id = await executeCreateRecipe(block.input, userId)
              createdRecipeId = id
              enqueueNutrition(id).catch(() => {})
              result = { success: true, recipe_id: id }
            } else if (block.name === 'edit_recipe') {
              const id = await executeEditRecipe(block.input, userId)
              updatedRecipeId = id
              enqueueNutrition(id).catch(() => {})
              result = { success: true, recipe_id: id }
            } else if (block.name === 'add_to_grocery_list') {
              result = await executeAddToGroceryList(block.input, userId)
              if (result.added_count > 0) groceryUpdated = true
            } else if (block.name === 'remove_from_grocery_list') {
              result = await executeRemoveFromGroceryList(block.input, userId)
              groceryUpdated = true
            } else {
              result = { error: 'Unknown tool' }
            }
          } catch (err) {
            result = { error: err.message }
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }

        currentMessages.push({ role: 'user', content: toolResults })
      } else {
        finalReply = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        break
      }
    }

    res.json({ reply: finalReply, created_recipe_id: createdRecipeId, updated_recipe_id: updatedRecipeId, grocery_updated: groceryUpdated })
  })
)

export default router
