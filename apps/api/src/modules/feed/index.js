import { Router } from 'express'
import { query } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// GET /api/feed
// Returns published recipes from all users EXCEPT the viewer, newest first.
// Includes is_saved flag so the client can render the bookmark state.
// ---------------------------------------------------------------------------
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('cursor').optional().isISO8601(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ?? 20
    const { cursor } = req.query
    const userId = req.user.sub

    const conditions = [
      'r.owner_id != $1',
      "r.status = 'published'",
      'r.deleted_at IS NULL',
    ]
    const params = [userId]

    if (cursor) {
      params.push(cursor)
      conditions.push(`r.created_at < $${params.length}`)
    }

    params.push(limit + 1)
    const { rows } = await pool.query(
      `SELECT r.id, r.title, r.status, r.cuisine, r.difficulty,
              r.prep_time_mins, r.cook_time_mins, r.base_servings,
              r.created_at, r.updated_at, r.owner_id,
              m.url      AS cover_url,
              COALESCE(p.display_name, u.username) AS owner_name,
              CASE WHEN sr.user_id IS NOT NULL THEN true ELSE false END AS is_saved
       FROM recipes r
       LEFT JOIN media_assets m  ON m.id = r.cover_media_id
       LEFT JOIN profiles p      ON p.user_id = r.owner_id
       LEFT JOIN users u         ON u.id = r.owner_id
       LEFT JOIN saved_recipes sr ON sr.recipe_id = r.id AND sr.user_id = $1
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

export default router
