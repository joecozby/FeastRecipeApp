import { Router } from 'express'
import { body, query, param } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'
import { normalizeIngredient } from '../../services/ingredientNormalizer.js'
import logger from '../../config/logger.js'
import { enqueueNutrition } from '../../workers/nutritionWorker.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRecipeOrThrow(id, userId) {
  const { rows: [recipe] } = await pool.query(
    `SELECT * FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  )
  if (!recipe) throw new AppError('Recipe not found', 404)
  return recipe
}

// Allows owner OR any viewer for published recipes. Returns is_owner + is_saved.
async function getRecipeForViewer(id, viewerUserId) {
  const { rows: [recipe] } = await pool.query(
    `SELECT r.*,
            COALESCE(p.display_name, u.username) AS owner_name,
            m.url AS cover_url,
            (r.owner_id = $2) AS is_owner,
            CASE WHEN sr.user_id IS NOT NULL THEN true ELSE false END AS is_saved
     FROM recipes r
     LEFT JOIN profiles p      ON p.user_id = r.owner_id
     LEFT JOIN users u         ON u.id = r.owner_id
     LEFT JOIN media_assets m  ON m.id = r.cover_media_id
     LEFT JOIN saved_recipes sr ON sr.recipe_id = r.id AND sr.user_id = $2
     WHERE r.id = $1
       AND r.deleted_at IS NULL
       AND (r.owner_id = $2 OR r.status = 'published')`,
    [id, viewerUserId]
  )
  if (!recipe) throw new AppError('Recipe not found', 404)

  const [{ rows: ingredients }, { rows: instructions }, { rows: tags }] = await Promise.all([
    pool.query(
      `SELECT ri.*, i.canonical_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.display_order`,
      [id]
    ),
    pool.query(
      `SELECT * FROM instructions WHERE recipe_id = $1 ORDER BY step_number`,
      [id]
    ),
    pool.query(
      `SELECT t.id, t.name, t.type FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id
       WHERE rt.recipe_id = $1`,
      [id]
    ),
  ])

  return { ...recipe, ingredients, instructions, tags }
}

async function getRecipeWithContent(id, userId) {
  return getRecipeForViewer(id, userId)
}

// ---------------------------------------------------------------------------
// GET /api/recipes
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('status').optional().isIn(['draft', 'published', 'saved']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isISO8601(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ?? 24
    const { status, cursor } = req.query
    const userId = req.user.sub

    // "saved" is a virtual status — pull from saved_recipes join instead of own recipes
    if (status === 'saved') {
      const conditions = ['s.user_id = $1', 'r.deleted_at IS NULL']
      const params = [userId]
      if (cursor) {
        params.push(cursor)
        conditions.push(`s.created_at < $${params.length}`)
      }
      params.push(limit + 1)
      const { rows } = await pool.query(
        `SELECT r.id, r.title, r.status, r.cuisine, r.difficulty,
                r.prep_time_mins, r.cook_time_mins, r.base_servings,
                r.owner_id, s.created_at, r.updated_at,
                m.url AS cover_url,
                COALESCE(p.display_name, u.username) AS owner_name,
                true AS is_saved
         FROM saved_recipes s
         JOIN recipes r       ON r.id = s.recipe_id
         LEFT JOIN media_assets m  ON m.id = r.cover_media_id
         LEFT JOIN profiles p      ON p.user_id = r.owner_id
         LEFT JOIN users u         ON u.id = r.owner_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.created_at DESC
         LIMIT $${params.length}`,
        params
      )
      const hasMore = rows.length > limit
      const data = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore ? data[data.length - 1].created_at : null
      return res.json({ data, cursor: nextCursor, limit })
    }

    // Own recipes
    const conditions = ['r.owner_id = $1', 'r.deleted_at IS NULL']
    const params = [userId]

    if (status) {
      params.push(status)
      conditions.push(`r.status = $${params.length}`)
    }
    if (cursor) {
      params.push(cursor)
      conditions.push(`r.created_at < $${params.length}`)
    }

    params.push(limit + 1)
    const { rows } = await pool.query(
      `SELECT r.id, r.title, r.status, r.cuisine, r.difficulty,
              r.prep_time_mins, r.cook_time_mins, r.base_servings,
              r.owner_id, r.created_at, r.updated_at,
              m.url AS cover_url,
              false AS is_saved
       FROM recipes r
       LEFT JOIN media_assets m ON m.id = r.cover_media_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params
    )

    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? data[data.length - 1].created_at : null

    res.json({ data, cursor: nextCursor, limit })
  })
)

// ---------------------------------------------------------------------------
// POST /api/recipes
// ---------------------------------------------------------------------------
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('title is required'),
    body('description').optional({ nullable: true }).isString(),
    body('cuisine').optional({ nullable: true }).isString(),
    body('difficulty').optional({ nullable: true }).isIn(['easy', 'medium', 'hard']),
    body('prep_time_mins').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('cook_time_mins').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('base_servings').optional({ nullable: true }).isFloat({ min: 0.5 }).toFloat(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { title, description, cuisine, difficulty, prep_time_mins, cook_time_mins, base_servings } = req.body

    const { rows: [recipe] } = await pool.query(
      `INSERT INTO recipes (owner_id, title, description, cuisine, difficulty, prep_time_mins, cook_time_mins, base_servings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [req.user.sub, title, description ?? null, cuisine ?? null, difficulty ?? null,
       prep_time_mins ?? null, cook_time_mins ?? null, base_servings ?? null]
    )

    res.status(201).json(recipe)
  })
)

// ---------------------------------------------------------------------------
// GET /api/recipes/:id  — owner OR any viewer for published recipes
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const recipe = await getRecipeForViewer(req.params.id, req.user.sub)
    res.json(recipe)
  })
)

// ---------------------------------------------------------------------------
// POST /api/recipes/:id/save  — save (bookmark) a recipe
// ---------------------------------------------------------------------------
router.post(
  '/:id/save',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const { rows: [recipe] } = await pool.query(
      `SELECT id, owner_id, status FROM recipes WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    )
    if (!recipe) throw new AppError('Recipe not found', 404)
    if (recipe.owner_id === req.user.sub) throw new AppError('Cannot save your own recipe', 400)
    if (recipe.status !== 'published') throw new AppError('Recipe is not public', 403)

    await pool.query(
      `INSERT INTO saved_recipes (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.sub, req.params.id]
    )
    res.json({ saved: true })
  })
)

// ---------------------------------------------------------------------------
// DELETE /api/recipes/:id/save  — unsave (unbookmark) a recipe
// ---------------------------------------------------------------------------
router.delete(
  '/:id/save',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    await pool.query(
      `DELETE FROM saved_recipes WHERE user_id = $1 AND recipe_id = $2`,
      [req.user.sub, req.params.id]
    )
    res.json({ saved: false })
  })
)

// ---------------------------------------------------------------------------
// PATCH /api/recipes/:id
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('title').optional().trim().notEmpty(),
    body('description').optional({ nullable: true }).isString(),
    body('cuisine').optional({ nullable: true }).isString(),
    body('difficulty').optional({ nullable: true }).isIn(['easy', 'medium', 'hard']),
    body('prep_time_mins').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('cook_time_mins').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('base_servings').optional({ nullable: true }).isFloat({ min: 0.5 }).toFloat(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    await getRecipeOrThrow(req.params.id, req.user.sub)

    const allowed = ['title', 'description', 'cuisine', 'difficulty', 'prep_time_mins', 'cook_time_mins', 'base_servings']
    const updates = []
    const params = []

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key])
        updates.push(`${key} = $${params.length}`)
      }
    }
    if (!updates.length) throw new AppError('No valid fields to update', 400)

    params.push(new Date().toISOString(), req.params.id, req.user.sub)
    const { rows: [recipe] } = await pool.query(
      `UPDATE recipes SET ${updates.join(', ')}, updated_at = $${params.length - 2}
       WHERE id = $${params.length - 1} AND owner_id = $${params.length}
       RETURNING *`,
      params
    )

    // When base_servings changes, recompute per_serving instantly from cached totals.
    // No USDA API call needed — totals don't change, only the divisor does.
    // Falls back to enqueuing the worker if total_nutrients hasn't been computed yet.
    if (req.body.base_servings !== undefined) {
      const newBase = Math.max(1, req.body.base_servings || 1)
      const { rows: [snap] } = await pool.query(
        `SELECT total_nutrients FROM nutrition_snapshots WHERE recipe_id = $1`,
        [req.params.id]
      )
      if (snap?.total_nutrients) {
        const perServing = {}
        for (const [key, val] of Object.entries(snap.total_nutrients)) {
          perServing[key] = Math.round(val / newBase)
        }
        await pool.query(
          `UPDATE nutrition_snapshots SET per_serving = $1, computed_at = now() WHERE recipe_id = $2`,
          [JSON.stringify(perServing), req.params.id]
        )
        logger.info(`Nutrition per-serving updated synchronously for recipe ${req.params.id} (base_servings=${newBase})`)
      } else {
        // No cached totals yet — enqueue a full recalculation
        enqueueNutrition(req.params.id).catch(err => logger.warn(`Failed to enqueue nutrition: ${err.message}`))
      }
    }

    res.json(recipe)
  })
)

// ---------------------------------------------------------------------------
// DELETE /api/recipes/:id  (soft delete)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    await getRecipeOrThrow(req.params.id, req.user.sub)
    await pool.query(
      `UPDATE recipes SET deleted_at = now() WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.sub]
    )
    res.status(204).send()
  })
)

// ---------------------------------------------------------------------------
// PATCH /api/recipes/:id/publish
// ---------------------------------------------------------------------------
router.patch(
  '/:id/publish',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const current = await getRecipeOrThrow(req.params.id, req.user.sub)
    const newStatus = current.status === 'published' ? 'draft' : 'published'
    const { rows: [recipe] } = await pool.query(
      `UPDATE recipes SET status = $1, updated_at = now()
       WHERE id = $2 AND owner_id = $3 RETURNING *`,
      [newStatus, req.params.id, req.user.sub]
    )
    res.json(recipe)
  })
)

// ---------------------------------------------------------------------------
// PUT /api/recipes/:id/content  — atomic save of ingredients + instructions + tags
// ---------------------------------------------------------------------------
router.put(
  '/:id/content',
  [
    param('id').isUUID(),
    body('ingredients').isArray(),
    body('instructions').isArray(),
    body('tags').optional({ nullable: true }).isArray(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    await getRecipeOrThrow(req.params.id, req.user.sub)
    const { ingredients = [], instructions = [], tags = [] } = req.body
    const recipeId = req.params.id

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // --- Ingredients ---
      await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipeId])
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i]
        const normalized = await normalizeIngredient(ing.raw_text || ing.name || '')
        await client.query(
          `INSERT INTO recipe_ingredients
             (recipe_id, ingredient_id, raw_text, quantity, unit, preparation, notes, is_optional, display_order, group_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            recipeId,
            ing.ingredient_id ?? normalized.ingredient_id ?? null,
            normalized.raw_text,
            ing.quantity ?? normalized.quantity ?? null,
            ing.unit ?? normalized.unit ?? null,
            ing.preparation ?? normalized.preparation ?? null,
            ing.notes ?? normalized.notes ?? null,
            ing.is_optional ?? false,
            i,
            ing.group_label ?? null,
          ]
        )
      }

      // --- Instructions ---
      await client.query(`DELETE FROM instructions WHERE recipe_id = $1`, [recipeId])
      for (let i = 0; i < instructions.length; i++) {
        const step = instructions[i]
        await client.query(
          `INSERT INTO instructions (recipe_id, step_number, body, group_label)
           VALUES ($1,$2,$3,$4)`,
          [recipeId, i + 1, step.body, step.group_label ?? null]
        )
      }

      // --- Tags ---
      await client.query(`DELETE FROM recipe_tags WHERE recipe_id = $1`, [recipeId])
      for (const tagNameOrId of tags) {
        // Accept tag id (UUID), name string, or { name } object
        const raw = typeof tagNameOrId === 'object' && tagNameOrId !== null
          ? tagNameOrId.name
          : tagNameOrId
        let tagId = raw
        if (!/^[0-9a-f-]{36}$/.test(String(raw))) {
          const { rows: [tag] } = await client.query(
            `INSERT INTO tags (name) VALUES (lower($1))
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [String(raw)]
          )
          tagId = tag.id
        }
        await client.query(
          `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [recipeId, tagId]
        )
      }

      // Bump updated_at
      await client.query(
        `UPDATE recipes SET updated_at = now() WHERE id = $1`,
        [recipeId]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const recipe = await getRecipeWithContent(recipeId, req.user.sub)
    enqueueNutrition(recipeId).catch(err => logger.warn(`Failed to enqueue nutrition: ${err.message}`))
    res.json(recipe)
  })
)

// ---------------------------------------------------------------------------
// GET /api/recipes/:id/nutrition
// ---------------------------------------------------------------------------
router.get(
  '/:id/nutrition',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    // Allow owner or any viewer of a published recipe
    const { rows: [recipe] } = await pool.query(
      `SELECT id, base_servings FROM recipes
       WHERE id = $1 AND deleted_at IS NULL AND (owner_id = $2 OR status = 'published')`,
      [req.params.id, req.user.sub]
    )
    if (!recipe) throw new AppError('Recipe not found', 404)
    const { rows: [snapshot] } = await pool.query(
      `SELECT total_nutrients, per_serving, computed_at, is_estimated
       FROM nutrition_snapshots WHERE recipe_id = $1`,
      [req.params.id]
    )
    if (!snapshot) return res.json(null)

    // Always compute per_serving fresh from total_nutrients ÷ current base_servings.
    // This ensures per-serving is correct even if base_servings was updated after
    // the last nutrition calculation.
    let perServing = snapshot.per_serving
    if (snapshot.total_nutrients) {
      const base = Math.max(1, recipe.base_servings || 1)
      perServing = {}
      for (const [key, val] of Object.entries(snapshot.total_nutrients)) {
        perServing[key] = Math.round(val / base)
      }
    }

    res.json({ per_serving: perServing, computed_at: snapshot.computed_at, is_estimated: snapshot.is_estimated })
  })
)

// ---------------------------------------------------------------------------
// POST /api/recipes/renormalize
// Re-runs ingredient normalization on every recipe_ingredient row belonging
// to the authenticated user. Call once after deploying normalizer improvements
// to fix ingredients that were stored with bad canonical names.
//
// What it does per ingredient row:
//   1. Re-parse and re-resolve the raw_text using the updated normalizer
//   2. If the resolved ingredient_id changed, update recipe_ingredients
//   3. Rebuild grocery list items (if any) so quantities/grouping are correct
// ---------------------------------------------------------------------------
router.post('/renormalize', asyncHandler(async (req, res) => {
  const userId = req.user.sub

  // Fetch all ingredient rows for this user's recipes
  const { rows: riRows } = await pool.query(
    `SELECT ri.id, ri.raw_text, ri.ingredient_id, ri.recipe_id
     FROM recipe_ingredients ri
     JOIN recipes r ON r.id = ri.recipe_id
     WHERE r.owner_id = $1 AND r.deleted_at IS NULL AND ri.raw_text IS NOT NULL`,
    [userId]
  )

  let updated = 0
  let unchanged = 0

  for (const ri of riRows) {
    const resolved = await normalizeIngredient(ri.raw_text)
    const newIngredientId = resolved.ingredient_id ?? null

    if (newIngredientId !== ri.ingredient_id) {
      await pool.query(
        `UPDATE recipe_ingredients
         SET ingredient_id = $1
         WHERE id = $2`,
        [newIngredientId, ri.id]
      )
      updated++
    } else {
      unchanged++
    }
  }

  // Rebuild grocery list items if the user has one, so updated ingredient_ids
  // and ingredient_keys take effect immediately
  const { rows: [listRow] } = await pool.query(
    `SELECT id FROM grocery_lists WHERE user_id = $1`,
    [userId]
  )

  let groceryRebuilt = false
  if (listRow) {
    const { rows: activeRecipes } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM grocery_list_recipes WHERE grocery_list_id = $1`,
      [listRow.id]
    )
    if (parseInt(activeRecipes[0].cnt) > 0) {
      // Import the rebuild function inline via a fresh transaction
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Snapshot checked state
        const { rows: existingItems } = await client.query(
          `SELECT ingredient_key, is_checked FROM grocery_list_items WHERE grocery_list_id = $1`,
          [listRow.id]
        )
        const checkedByKey = new Map()
        for (const item of existingItems) {
          if (item.ingredient_key && item.is_checked) checkedByKey.set(item.ingredient_key, true)
        }

        // Wipe and re-insert
        await client.query(`DELETE FROM grocery_list_items WHERE grocery_list_id = $1`, [listRow.id])

        const { rows: listRecipes } = await client.query(
          `SELECT glr.recipe_id, glr.servings AS chosen_servings, r.base_servings
           FROM grocery_list_recipes glr
           JOIN recipes r ON r.id = glr.recipe_id
           WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL`,
          [listRow.id]
        )

        let order = 0
        for (const lr of listRecipes) {
          const scale = lr.base_servings
            ? (lr.chosen_servings ?? lr.base_servings) / lr.base_servings : 1

          const { rows: ings } = await client.query(
            `SELECT ri.ingredient_id, ri.raw_text, ri.quantity, ri.unit,
                    ri.display_order, i.canonical_name
             FROM recipe_ingredients ri
             LEFT JOIN ingredients i ON i.id = ri.ingredient_id
             WHERE ri.recipe_id = $1 ORDER BY ri.display_order`,
            [lr.recipe_id]
          )

          for (const ing of ings) {
            const scaledQty = ing.quantity != null
              ? Math.round(parseFloat(ing.quantity) * scale * 10000) / 10000 : null
            const displayName = ing.canonical_name || ing.raw_text
            const ingredientKey = ing.ingredient_id
              ? `id:${ing.ingredient_id}:${ing.unit ?? ''}`
              : `raw:${(ing.raw_text || '').toLowerCase().trim()}`
            const isChecked = checkedByKey.get(ingredientKey) ?? false

            await client.query(
              `INSERT INTO grocery_list_items
                 (grocery_list_id, recipe_id, ingredient_id, display_name,
                  quantity, unit, is_checked, ingredient_key, display_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [listRow.id, lr.recipe_id, ing.ingredient_id ?? null, displayName,
               scaledQty, ing.unit ?? null, isChecked, ingredientKey, order++]
            )
          }
        }

        await client.query(`UPDATE grocery_lists SET updated_at = now() WHERE id = $1`, [listRow.id])
        await client.query('COMMIT')
        groceryRebuilt = true
      } catch (err) {
        await client.query('ROLLBACK')
        logger.warn('Grocery rebuild failed during renormalize', { err: err.message })
      } finally {
        client.release()
      }
    }
  }

  res.json({
    message: 'Re-normalization complete',
    ingredients_checked: riRows.length,
    ingredients_updated: updated,
    ingredients_unchanged: unchanged,
    grocery_rebuilt: groceryRebuilt,
  })
}))

export default router
