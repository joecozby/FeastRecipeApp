import { Router } from 'express'
import { query } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// GET /api/search?q=&cuisine=&tags=&difficulty=&cookbook=&limit=&cursor=
router.get(
  '/',
  [
    query('q').optional().isString().trim(),
    query('cuisine').optional().isString(),
    query('difficulty').optional().isIn(['easy', 'medium', 'hard']),
    query('tags').optional().isString(),       // comma-separated tag names
    query('cookbook').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isFloat().toFloat(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { q, cuisine, difficulty, cookbook } = req.query
    const tags = req.query.tags ? req.query.tags.split(',').map((t) => t.trim().toLowerCase()) : []
    const limit = req.query.limit ?? 24
    const cursor = req.query.cursor ?? null

    const conditions = ['r.owner_id = $1', 'r.deleted_at IS NULL', "r.status = 'published'"]
    const params = [req.user.sub]

    let scoreExpr = '0'

    if (q && q.length > 0) {
      // Build a prefix tsquery so partial input like "Ita" matches "Italian".
      // Each word except the last is matched exactly; the last gets :* for prefix matching.
      // Words are sanitized to alphanumeric to avoid tsquery syntax errors.
      const words = q.trim().split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean)
      const prefixQuery = words.length > 0
        ? words.map((w, i) => i === words.length - 1 ? `${w}:*` : w).join(' & ')
        : null

      params.push(q)
      const qi = params.length

      if (prefixQuery) {
        params.push(prefixQuery)
        const pqi = params.length
        // Score: prefix FTS rank + word_similarity (handles partial substring matches)
        scoreExpr = `(ts_rank(r.fts_vector, to_tsquery('english', $${pqi})) * 2 + word_similarity($${qi}, r.title))`
        conditions.push(
          `(r.fts_vector @@ to_tsquery('english', $${pqi})
            OR word_similarity($${qi}, r.title) > 0.1
            OR r.title ILIKE '%' || $${qi} || '%')`
        )
      } else {
        scoreExpr = `word_similarity($${qi}, r.title)`
        conditions.push(`(word_similarity($${qi}, r.title) > 0.1 OR r.title ILIKE '%' || $${qi} || '%')`)
      }
    }

    if (cuisine) {
      params.push(cuisine)
      conditions.push(`lower(r.cuisine) = lower($${params.length})`)
    }

    if (difficulty) {
      params.push(difficulty)
      conditions.push(`r.difficulty = $${params.length}`)
    }

    if (tags.length > 0) {
      params.push(tags)
      conditions.push(
        `EXISTS (
          SELECT 1 FROM recipe_tags rt
          JOIN tags t ON t.id = rt.tag_id
          WHERE rt.recipe_id = r.id AND lower(t.name) = ANY($${params.length})
        )`
      )
    }

    if (cookbook) {
      params.push(cookbook)
      conditions.push(
        `EXISTS (SELECT 1 FROM cookbook_recipes cr WHERE cr.recipe_id = r.id AND cr.cookbook_id = $${params.length})`
      )
    }

    if (cursor != null) {
      params.push(cursor)
      conditions.push(`${scoreExpr} < $${params.length}`)
    }

    params.push(limit + 1)
    const { rows } = await pool.query(
      `SELECT r.id, r.title, r.status, r.cuisine, r.difficulty,
              r.prep_time_mins, r.cook_time_mins, r.base_servings,
              r.cover_media_id, r.created_at,
              m.url AS cover_url,
              ${scoreExpr} AS score
       FROM recipes r
       LEFT JOIN media_assets m ON m.id = r.cover_media_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY score DESC, r.created_at DESC
       LIMIT $${params.length}`,
      params
    )

    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? data[data.length - 1].score : null

    res.json({ data, cursor: nextCursor, limit })
  })
)

export default router
