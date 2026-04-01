import { Router } from 'express'
import { body, param } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// Grocery list merge logic
// ---------------------------------------------------------------------------

async function mergeGroceryList(groceryListId, client) {
  // 1. Load all recipes in the list with their chosen servings
  const { rows: listRecipes } = await client.query(
    `SELECT glr.recipe_id, glr.servings AS chosen_servings, r.base_servings
     FROM grocery_list_recipes glr
     JOIN recipes r ON r.id = glr.recipe_id
     WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL`,
    [groceryListId]
  )

  // 2. Load existing items to preserve is_checked state
  const { rows: existingItems } = await client.query(
    `SELECT ingredient_id, is_checked FROM grocery_list_items WHERE grocery_list_id = $1`,
    [groceryListId]
  )
  const checkedByIngredient = new Map()
  for (const item of existingItems) {
    if (item.ingredient_id && item.is_checked) {
      checkedByIngredient.set(item.ingredient_id, true)
    }
  }

  // 3. Load + scale all ingredients across all recipes
  const scaledIngredients = []
  for (const lr of listRecipes) {
    const scale = lr.base_servings
      ? (lr.chosen_servings ?? lr.base_servings) / lr.base_servings
      : 1

    const { rows: ings } = await client.query(
      `SELECT ri.ingredient_id, ri.raw_text, ri.quantity, ri.unit,
              ri.display_order, i.canonical_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1`,
      [lr.recipe_id]
    )

    for (const ing of ings) {
      scaledIngredients.push({
        ingredient_id: ing.ingredient_id,
        raw_text: ing.raw_text,
        display_name: ing.canonical_name || ing.raw_text,
        quantity: ing.quantity != null ? parseFloat(ing.quantity) * scale : null,
        unit: ing.unit,
        recipe_id: lr.recipe_id,
      })
    }
  }

  // 4. Group and merge
  // Key: ingredient_id+unit for resolved items, raw_text for unresolved
  const mergedMap = new Map()

  for (const ing of scaledIngredients) {
    const key = ing.ingredient_id
      ? `id:${ing.ingredient_id}:${ing.unit ?? ''}`
      : `raw:${ing.raw_text.toLowerCase().trim()}`

    if (mergedMap.has(key)) {
      const entry = mergedMap.get(key)
      if (ing.quantity != null && entry.quantity != null) {
        entry.quantity += ing.quantity
      } else {
        entry.quantity = null // can't sum if either is null
      }
      entry.source_recipe_ids.push(ing.recipe_id)
    } else {
      mergedMap.set(key, {
        ingredient_id: ing.ingredient_id,
        display_name: ing.display_name,
        quantity: ing.quantity,
        unit: ing.unit,
        source_recipe_ids: [ing.recipe_id],
      })
    }
  }

  // 5. Delete existing items and re-insert merged set in a transaction
  await client.query(
    `DELETE FROM grocery_list_items WHERE grocery_list_id = $1`,
    [groceryListId]
  )

  let order = 0
  for (const item of mergedMap.values()) {
    const isChecked = item.ingredient_id
      ? (checkedByIngredient.get(item.ingredient_id) ?? false)
      : false

    await client.query(
      `INSERT INTO grocery_list_items
         (grocery_list_id, ingredient_id, display_name, quantity, unit,
          is_checked, source_recipe_ids, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        groceryListId,
        item.ingredient_id ?? null,
        item.display_name,
        item.quantity != null ? Math.round(item.quantity * 10000) / 10000 : null,
        item.unit ?? null,
        isChecked,
        JSON.stringify(item.source_recipe_ids),
        order++,
      ]
    )
  }

  // Bump list updated_at
  await client.query(
    `UPDATE grocery_lists SET updated_at = now() WHERE id = $1`,
    [groceryListId]
  )
}

// ---------------------------------------------------------------------------
// Helper — get or create the user's single grocery list
// ---------------------------------------------------------------------------

async function getOrCreateList(userId) {
  const { rows: [existing] } = await pool.query(
    `SELECT id FROM grocery_lists WHERE user_id = $1`,
    [userId]
  )
  if (existing) return existing.id

  const { rows: [created] } = await pool.query(
    `INSERT INTO grocery_lists (user_id) VALUES ($1) RETURNING id`,
    [userId]
  )
  return created.id
}

// ---------------------------------------------------------------------------
// GET /api/grocery-lists
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const listId = await getOrCreateList(req.user.sub)

  const [{ rows: [list] }, { rows: recipes }, { rows: items }] = await Promise.all([
    pool.query(
      `SELECT gl.id, gl.updated_at FROM grocery_lists gl WHERE gl.id = $1`,
      [listId]
    ),
    pool.query(
      `SELECT glr.recipe_id, glr.servings, r.title, r.base_servings
       FROM grocery_list_recipes glr
       JOIN recipes r ON r.id = glr.recipe_id
       WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL`,
      [listId]
    ),
    pool.query(
      `SELECT id, grocery_list_id, ingredient_id, display_name,
              quantity::float AS quantity, unit, is_checked, notes,
              display_order, source_recipe_ids, created_at, updated_at
       FROM grocery_list_items WHERE grocery_list_id = $1 ORDER BY display_order`,
      [listId]
    ),
  ])

  res.json({ ...list, recipes, items })
}))

// ---------------------------------------------------------------------------
// POST /api/grocery-lists/recipes  — add recipe, recalculate
// ---------------------------------------------------------------------------
router.post(
  '/recipes',
  [
    body('recipe_id').isUUID(),
    body('servings').optional({ nullable: true }).isFloat({ min: 0.5 }).toFloat(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const listId = await getOrCreateList(req.user.sub)
    const { recipe_id, servings } = req.body

    // Verify recipe exists and belongs to user
    const { rows: [recipe] } = await pool.query(
      `SELECT id, base_servings FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [recipe_id, req.user.sub]
    )
    if (!recipe) throw new AppError('Recipe not found', 404)

    const chosenServings = servings ?? recipe.base_servings

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO grocery_list_recipes (grocery_list_id, recipe_id, servings)
         VALUES ($1,$2,$3)
         ON CONFLICT (grocery_list_id, recipe_id) DO UPDATE SET servings = EXCLUDED.servings`,
        [listId, recipe_id, chosenServings]
      )
      await mergeGroceryList(listId, client)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.status(201).json({ grocery_list_id: listId, recipe_id, servings: chosenServings })
  })
)

// ---------------------------------------------------------------------------
// DELETE /api/grocery-lists/recipes/:id  — remove recipe, recalculate
// ---------------------------------------------------------------------------
router.delete(
  '/recipes/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const listId = await getOrCreateList(req.user.sub)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM grocery_list_recipes WHERE grocery_list_id = $1 AND recipe_id = $2`,
        [listId, req.params.id]
      )
      await mergeGroceryList(listId, client)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.status(204).send()
  })
)

// ---------------------------------------------------------------------------
// PATCH /api/grocery-lists/items/:id  — toggle is_checked, update notes
// ---------------------------------------------------------------------------
router.patch(
  '/items/:id',
  [
    param('id').isUUID(),
    body('is_checked').optional({ nullable: true }).isBoolean().toBoolean(),
    body('notes').optional({ nullable: true }).isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const listId = await getOrCreateList(req.user.sub)

    // Verify item belongs to user's list
    const { rows: [item] } = await pool.query(
      `SELECT id FROM grocery_list_items WHERE id = $1 AND grocery_list_id = $2`,
      [req.params.id, listId]
    )
    if (!item) throw new AppError('Item not found', 404)

    const updates = []
    const params = []
    if (req.body.is_checked !== undefined) {
      params.push(req.body.is_checked)
      updates.push(`is_checked = $${params.length}`)
    }
    if (req.body.notes !== undefined) {
      params.push(req.body.notes)
      updates.push(`notes = $${params.length}`)
    }
    if (!updates.length) throw new AppError('No valid fields to update', 400)

    params.push(req.params.id)
    const { rows: [updated] } = await pool.query(
      `UPDATE grocery_list_items SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING *`,
      params
    )
    res.json(updated)
  })
)

export default router
