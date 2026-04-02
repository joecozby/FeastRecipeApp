import { Router } from 'express'
import { param } from 'express-validator'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// ---------------------------------------------------------------------------
// GET /api/spice-cabinet/master
// Returns all master items ordered by category, sort_order
// ---------------------------------------------------------------------------
router.get('/master', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, category, sort_order
     FROM spice_cabinet_master
     ORDER BY category, sort_order`
  )
  res.json(rows)
}))

// ---------------------------------------------------------------------------
// GET /api/spice-cabinet
// Returns the set of master_ids the current user has in their cabinet
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT master_id FROM user_spice_cabinet WHERE user_id = $1`,
    [req.user.sub]
  )
  res.json({ owned: rows.map((r) => r.master_id) })
}))

// ---------------------------------------------------------------------------
// POST /api/spice-cabinet/:masterId
// Add an item to the user's cabinet (upsert — no error if already exists)
// ---------------------------------------------------------------------------
router.post(
  '/:masterId',
  [param('masterId').isInt({ min: 1 }).toInt(), validate],
  asyncHandler(async (req, res) => {
    const masterId = req.params.masterId
    await pool.query(
      `INSERT INTO user_spice_cabinet (user_id, master_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, master_id) DO NOTHING`,
      [req.user.sub, masterId]
    )
    res.status(201).json({ master_id: masterId })
  })
)

// ---------------------------------------------------------------------------
// DELETE /api/spice-cabinet/:masterId
// Remove an item from the user's cabinet
// ---------------------------------------------------------------------------
router.delete(
  '/:masterId',
  [param('masterId').isInt({ min: 1 }).toInt(), validate],
  asyncHandler(async (req, res) => {
    await pool.query(
      `DELETE FROM user_spice_cabinet WHERE user_id = $1 AND master_id = $2`,
      [req.user.sub, req.params.masterId]
    )
    res.status(204).send()
  })
)

export default router
