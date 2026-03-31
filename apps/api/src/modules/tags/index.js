import { Router } from 'express'
import { body, query } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// GET /api/tags?q=
router.get(
  '/',
  [query('q').optional().isString().trim(), validate],
  asyncHandler(async (req, res) => {
    const { q } = req.query

    if (q && q.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, name, type FROM tags
         WHERE similarity(name, $1) > 0.1 OR name ILIKE $2
         ORDER BY type DESC, similarity(name, $1) DESC
         LIMIT 20`,
        [q, `%${q}%`]
      )
      return res.json(rows)
    }

    const { rows } = await pool.query(
      `SELECT id, name, type FROM tags ORDER BY type DESC, name ASC`
    )
    res.json(rows)
  })
)

// POST /api/tags
router.post(
  '/',
  [body('name').trim().notEmpty().toLowerCase(), validate],
  asyncHandler(async (req, res) => {
    const { rows: [tag] } = await pool.query(
      `INSERT INTO tags (name, type) VALUES (lower($1), 'user')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [req.body.name]
    )
    res.status(201).json(tag)
  })
)

export default router
