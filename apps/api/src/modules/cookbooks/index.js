import { Router } from 'express'
import { body, param } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

async function getCookbookOrThrow(id, userId) {
  const { rows: [cb] } = await pool.query(
    `SELECT * FROM cookbooks WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  )
  if (!cb) throw new AppError('Cookbook not found', 404)
  return cb
}

// GET /api/cookbooks
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, description, cover_url, created_at, updated_at,
            (SELECT count(*) FROM cookbook_recipes cr WHERE cr.cookbook_id = c.id) AS recipe_count
     FROM cookbooks c
     WHERE owner_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [req.user.sub]
  )
  res.json(rows)
}))

// POST /api/cookbooks
router.post(
  '/',
  [
    body('title').trim().notEmpty(),
    body('description').optional({ nullable: true }).isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { title, description } = req.body
    const { rows: [cb] } = await pool.query(
      `INSERT INTO cookbooks (owner_id, title, description) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.sub, title, description ?? null]
    )
    res.status(201).json(cb)
  })
)

// GET /api/cookbooks/:id  (with recipes)
router.get(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const cb = await getCookbookOrThrow(req.params.id, req.user.sub)
    const { rows: recipes } = await pool.query(
      `SELECT r.id, r.title, r.status, r.cuisine, r.difficulty,
              r.prep_time_mins, r.cook_time_mins, r.base_servings,
              r.cover_media_id, cr.display_order, cr.added_at,
              m.url AS cover_url
       FROM cookbook_recipes cr
       JOIN recipes r ON r.id = cr.recipe_id
       LEFT JOIN media_assets m ON m.id = r.cover_media_id
       WHERE cr.cookbook_id = $1 AND r.deleted_at IS NULL
       ORDER BY cr.display_order, cr.added_at`,
      [req.params.id]
    )
    res.json({ ...cb, recipes })
  })
)

// PATCH /api/cookbooks/:id
router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('title').optional({ nullable: true }).trim().notEmpty(),
    body('description').optional({ nullable: true }).isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    await getCookbookOrThrow(req.params.id, req.user.sub)
    const updates = []
    const params = []
    for (const key of ['title', 'description']) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key])
        updates.push(`${key} = $${params.length}`)
      }
    }
    if (!updates.length) throw new AppError('No valid fields to update', 400)
    params.push(req.params.id, req.user.sub)
    const { rows: [cb] } = await pool.query(
      `UPDATE cookbooks SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND owner_id = $${params.length}
       RETURNING *`,
      params
    )
    res.json(cb)
  })
)

// DELETE /api/cookbooks/:id
router.delete(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    await getCookbookOrThrow(req.params.id, req.user.sub)
    await pool.query(
      `UPDATE cookbooks SET deleted_at = now() WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.sub]
    )
    res.status(204).send()
  })
)

// POST /api/cookbooks/:id/recipes
router.post(
  '/:id/recipes',
  [
    param('id').isUUID(),
    body('recipe_id').isUUID(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    await getCookbookOrThrow(req.params.id, req.user.sub)

    // Verify recipe belongs to user
    const { rows: [recipe] } = await pool.query(
      `SELECT id FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [req.body.recipe_id, req.user.sub]
    )
    if (!recipe) throw new AppError('Recipe not found', 404)

    const { rows: [{ max_order }] } = await pool.query(
      `SELECT coalesce(max(display_order), -1) AS max_order FROM cookbook_recipes WHERE cookbook_id = $1`,
      [req.params.id]
    )
    await pool.query(
      `INSERT INTO cookbook_recipes (cookbook_id, recipe_id, display_order)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, req.body.recipe_id, max_order + 1]
    )
    res.status(201).json({ cookbook_id: req.params.id, recipe_id: req.body.recipe_id })
  })
)

// DELETE /api/cookbooks/:id/recipes/:rid
router.delete(
  '/:id/recipes/:rid',
  [param('id').isUUID(), param('rid').isUUID(), validate],
  asyncHandler(async (req, res) => {
    await getCookbookOrThrow(req.params.id, req.user.sub)
    await pool.query(
      `DELETE FROM cookbook_recipes WHERE cookbook_id = $1 AND recipe_id = $2`,
      [req.params.id, req.params.rid]
    )
    res.status(204).send()
  })
)

export default router
