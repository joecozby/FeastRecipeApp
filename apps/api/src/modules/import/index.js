import { Router } from 'express'
import { body, param } from 'express-validator'
import { Queue } from 'bullmq'
import pool from '../../config/db.js'
import { newRedisConnection } from '../../config/redis.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

const importQueue = new Queue('import', { connection: newRedisConnection() })

// POST /api/import
router.post(
  '/',
  [
    body('source_type').isIn(['url', 'instagram', 'text', 'manual', 'photo']),
    body('source_input').notEmpty().withMessage('source_input is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { source_type, source_input } = req.body

    // ── Deduplication ───────────────────────────────────────────────────────
    // For URL and Instagram imports, check whether this user already has a
    // recipe imported from the same source URL.  If so, skip the entire
    // pipeline and return the existing recipe immediately.
    if (source_type === 'url' || source_type === 'instagram') {
      const { rows: [existing] } = await pool.query(
        `SELECT id FROM recipes
         WHERE owner_id = $1 AND source_url = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [req.user.sub, source_input]
      )
      if (existing) {
        // Record the attempt as a pre-completed job so history is preserved
        const { rows: [job] } = await pool.query(
          `INSERT INTO import_jobs (user_id, source_type, source_input, status, recipe_id)
           VALUES ($1, $2, $3, 'done', $4)
           RETURNING id`,
          [req.user.sub, source_type, source_input, existing.id]
        )
        return res.status(202).json({ jobId: job.id, recipe_id: existing.id, duplicate: true })
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const { rows: [job] } = await pool.query(
      `INSERT INTO import_jobs (user_id, source_type, source_input)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [req.user.sub, source_type, source_input]
    )

    await importQueue.add('process', { jobId: job.id, userId: req.user.sub }, {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })

    res.status(202).json({ jobId: job.id })
  })
)

// GET /api/import/:jobId
router.get(
  '/:jobId',
  [param('jobId').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const { rows: [job] } = await pool.query(
      `SELECT id, status, recipe_id, error_message, created_at, updated_at
       FROM import_jobs
       WHERE id = $1 AND user_id = $2`,
      [req.params.jobId, req.user.sub]
    )
    if (!job) throw new AppError('Job not found', 404)
    res.json(job)
  })
)

export default router
