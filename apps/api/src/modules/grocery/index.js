import { Router } from 'express'
import { body, param } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// Helper — build a stable ingredient_key for grouping across recipes
// ---------------------------------------------------------------------------

function makeIngredientKey(ingredientId, unit, rawText) {
  if (ingredientId) return `id:${ingredientId}:${unit ?? ''}`
  return `raw:${(rawText || '').toLowerCase().trim()}`
}

// ---------------------------------------------------------------------------
// Rebuild grocery items — stores ONE ROW PER (recipe × ingredient).
// No quantities are merged in the DB; that happens at display time in the UI.
// Checked state is preserved by ingredient_key so checking off "olive oil"
// once survives recipe removals/re-adds.
// ---------------------------------------------------------------------------

async function rebuildGroceryItems(groceryListId, client) {
  // 1. Load all recipes currently in the list
  const { rows: listRecipes } = await client.query(
    `SELECT glr.recipe_id, glr.servings AS chosen_servings, r.base_servings
     FROM grocery_list_recipes glr
     JOIN recipes r ON r.id = glr.recipe_id
     WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL`,
    [groceryListId]
  )

  // 2. Snapshot checked-by-ingredient_key before wiping items
  const { rows: existingItems } = await client.query(
    `SELECT ingredient_key, is_checked
     FROM grocery_list_items WHERE grocery_list_id = $1`,
    [groceryListId]
  )
  const checkedByKey = new Map()
  for (const item of existingItems) {
    if (item.ingredient_key && item.is_checked) {
      checkedByKey.set(item.ingredient_key, true)
    }
  }

  // 3. Delete all existing items
  await client.query(
    `DELETE FROM grocery_list_items WHERE grocery_list_id = $1`,
    [groceryListId]
  )

  // 4. Insert one row per (recipe × ingredient), scaled to chosen servings
  let order = 0
  for (const lr of listRecipes) {
    const scale = lr.base_servings
      ? (lr.chosen_servings ?? lr.base_servings) / lr.base_servings
      : 1

    const { rows: ings } = await client.query(
      `SELECT ri.ingredient_id, ri.raw_text, ri.quantity, ri.unit,
              ri.display_order, i.canonical_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.display_order`,
      [lr.recipe_id]
    )

    for (const ing of ings) {
      const scaledQty = ing.quantity != null
        ? Math.round(parseFloat(ing.quantity) * scale * 10000) / 10000
        : null
      const displayName = ing.canonical_name || ing.raw_text
      const ingredientKey = makeIngredientKey(ing.ingredient_id, ing.unit, ing.raw_text)
      const isChecked = checkedByKey.get(ingredientKey) ?? false

      await client.query(
        `INSERT INTO grocery_list_items
           (grocery_list_id, recipe_id, ingredient_id, display_name,
            quantity, unit, is_checked, ingredient_key, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          groceryListId,
          lr.recipe_id,
          ing.ingredient_id ?? null,
          displayName,
          scaledQty,
          ing.unit ?? null,
          isChecked,
          ingredientKey,
          order++,
        ]
      )
    }
  }

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
// Returns the list with all recipes and all per-recipe items.
// The frontend groups/merges for display depending on the view mode.
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const listId = await getOrCreateList(req.user.sub)

  const [{ rows: [list] }, { rows: recipes }, { rows: items }] = await Promise.all([
    pool.query(
      `SELECT id, updated_at FROM grocery_lists WHERE id = $1`,
      [listId]
    ),
    pool.query(
      `SELECT glr.recipe_id, glr.servings, r.title, r.base_servings
       FROM grocery_list_recipes glr
       JOIN recipes r ON r.id = glr.recipe_id
       WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL
       ORDER BY glr.added_at`,
      [listId]
    ),
    pool.query(
      `SELECT gli.id, gli.recipe_id, gli.ingredient_id, gli.display_name,
              gli.quantity::float AS quantity, gli.unit, gli.is_checked,
              gli.notes, gli.ingredient_key, gli.display_order,
              scm.id AS spice_cabinet_master_id,
              (usc.master_id IS NOT NULL) AS in_spice_cabinet
       FROM grocery_list_items gli
       LEFT JOIN spice_cabinet_master scm ON (
         lower(scm.name) = lower(gli.display_name)
         OR similarity(scm.name, gli.display_name) > 0.55
       )
       LEFT JOIN user_spice_cabinet usc ON usc.master_id = scm.id AND usc.user_id = $2
       WHERE gli.grocery_list_id = $1
       ORDER BY gli.display_order`,
      [listId, req.user.sub]
    ),
  ])

  res.json({ ...list, recipes, items })
}))

// ---------------------------------------------------------------------------
// POST /api/grocery-lists/recipes  — add recipe, rebuild items
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
      await rebuildGroceryItems(listId, client)
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
// DELETE /api/grocery-lists/recipes/:id  — remove recipe, rebuild items
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
      await rebuildGroceryItems(listId, client)
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
// PATCH /api/grocery-lists/items/:id  — toggle a single item (by-recipe view)
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

// ---------------------------------------------------------------------------
// PATCH /api/grocery-lists/ingredient  — bulk check/uncheck by ingredient_key
// Used by the Combined and By Category views to toggle all rows for an
// ingredient across all recipes at once.
// ---------------------------------------------------------------------------
router.patch(
  '/ingredient',
  [
    body('ingredient_key').notEmpty().withMessage('ingredient_key is required'),
    body('is_checked').isBoolean().toBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const listId = await getOrCreateList(req.user.sub)
    const { ingredient_key, is_checked } = req.body

    await pool.query(
      `UPDATE grocery_list_items
       SET is_checked = $1, updated_at = now()
       WHERE grocery_list_id = $2 AND ingredient_key = $3`,
      [is_checked, listId, ingredient_key]
    )

    res.json({ ok: true })
  })
)

export default router
