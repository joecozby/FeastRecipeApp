import { Router } from 'express'
import { body } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'
import { normalizeIngredient } from '../../services/ingredientNormalizer.js'
import { enqueueNutrition } from '../../workers/nutritionWorker.js'

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

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

router.post(
  '/chat',
  [
    body('message').trim().notEmpty().withMessage('message is required'),
    body('history').optional().isArray(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { ANTHROPIC_API_KEY } = process.env
    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'sk-ant-stub') {
      return res.json({
        reply: "AI features require a real Anthropic API key. Set ANTHROPIC_API_KEY in your Railway API service variables.",
        created_recipe_id: null,
        updated_recipe_id: null,
      })
    }

    const { message, history = [] } = req.body
    const userId = req.user.sub

    // Fetch user's recipes to give Claude context
    const { rows: userRecipes } = await pool.query(
      `SELECT id, title, cuisine, difficulty FROM recipes
       WHERE owner_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 30`,
      [userId]
    )

    const recipeList = userRecipes.length
      ? userRecipes.map(r =>
          `- ${r.title} (id: ${r.id})${r.cuisine ? `, ${r.cuisine}` : ''}${r.difficulty ? `, ${r.difficulty}` : ''}`
        ).join('\n')
      : 'No recipes yet.'

    const systemPrompt = `You are an AI cooking assistant built into Feast, a personal recipe organizer. You help users with:
- Answering cooking questions and giving culinary advice
- Suggesting recipes and creative variations
- Recommending ingredient substitutions when someone is missing something
- Creating new recipes and saving them to their account (use the create_recipe tool)
- Editing existing recipes (use the edit_recipe tool)

The user's current recipes:
${recipeList}

When the user asks you to create a recipe, ALWAYS use the create_recipe tool to save it — do not just describe it in text. Be thorough: include all ingredients with quantities and clear step-by-step instructions. When editing, look up the recipe id from the list above and use the edit_recipe tool.`

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    let createdRecipeId = null
    let updatedRecipeId = null
    let finalReply = ''

    // Build initial messages, filtering history to only user/assistant roles
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

    res.json({ reply: finalReply, created_recipe_id: createdRecipeId, updated_recipe_id: updatedRecipeId })
  })
)

export default router
