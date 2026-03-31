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

async function getRecipeWithContent(id, userId) {
  await getRecipeOrThrow(id, userId)

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

  const { rows: [recipe] } = await pool.query(
    `SELECT r.*,
            p.display_name AS owner_name
     FROM recipes r
     LEFT JOIN profiles p ON p.user_id = r.owner_id
     WHERE r.id = $1`,
    [id]
  )

  return { ...recipe, ingredients, instructions, tags }
}

// ---------------------------------------------------------------------------
// GET /api/recipes
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('status').optional().isIn(['draft', 'published']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isISO8601(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ?? 24
    const { status, cursor } = req.query

    const conditions = ['r.owner_id = $1', 'r.deleted_at IS NULL']
    const params = [req.user.sub]

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
              r.cover_media_id, r.created_at, r.updated_at,
              m.url AS cover_url
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
    body('description').optional().isString(),
    body('cuisine').optional().isString(),
    body('difficulty').optional().isIn(['easy', 'medium', 'hard']),
    body('prep_time_mins').optional().isInt({ min: 0 }).toInt(),
    body('cook_time_mins').optional().isInt({ min: 0 }).toInt(),
    body('base_servings').optional().isFloat({ min: 0.5 }).toFloat(),
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
// GET /api/recipes/:id
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const recipe = await getRecipeWithContent(req.params.id, req.user.sub)
    res.json(recipe)
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
    body('description').optional().isString(),
    body('cuisine').optional().isString(),
    body('difficulty').optional().isIn(['easy', 'medium', 'hard']),
    body('prep_time_mins').optional().isInt({ min: 0 }).toInt(),
    body('cook_time_mins').optional().isInt({ min: 0 }).toInt(),
    body('base_servings').optional().isFloat({ min: 0.5 }).toFloat(),
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

    // Recalculate nutrition whenever base_servings changes (per-serving values depend on it)
    if (req.body.base_servings !== undefined) {
      enqueueNutrition(req.params.id).catch(err => logger.warn(`Failed to enqueue nutrition: ${err.message}`))
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
    await getRecipeOrThrow(req.params.id, req.user.sub)
    const { rows: [recipe] } = await pool.query(
      `UPDATE recipes SET status = 'published', updated_at = now()
       WHERE id = $1 AND owner_id = $2 RETURNING *`,
      [req.params.id, req.user.sub]
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
    body('tags').optional().isArray(),
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
    await getRecipeOrThrow(req.params.id, req.user.sub)
    const { rows: [snapshot] } = await pool.query(
      `SELECT per_serving, computed_at, is_estimated
       FROM nutrition_snapshots WHERE recipe_id = $1`,
      [req.params.id]
    )
    if (!snapshot) return res.json(null)
    res.json(snapshot)
  })
)

export default router
