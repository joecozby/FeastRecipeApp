import { Router } from 'express'
import { body, param } from 'express-validator'
import { randomUUID } from 'crypto'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'

const router = Router()
router.use(requireAuth)

// POST /api/media/presign  — stubbed (real path would call S3 presignedPost)
router.post(
  '/presign',
  [
    body('entity_type').isIn(['recipe', 'profile', 'cookbook']),
    body('entity_id').isUUID(),
    body('mime_type').isString().notEmpty(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { entity_type, entity_id, mime_type } = req.body
    const key = `${entity_type}/${entity_id}/${randomUUID()}`

    // Stub: return a fake presigned URL
    res.json({
      upload_url: `https://stub-s3.example.com/${key}`,
      storage_key: key,
      fields: {},
      _stub: true,
    })
  })
)

// POST /api/media  — register an uploaded asset
router.post(
  '/',
  [
    body('entity_type').isIn(['recipe', 'profile', 'cookbook']),
    body('entity_id').isUUID(),
    body('type').isIn(['image', 'video']),
    body('storage_key').notEmpty(),
    body('url').isURL(),
    body('mime_type').optional().isString(),
    body('size_bytes').optional().isInt({ min: 0 }).toInt(),
    body('width').optional().isInt({ min: 1 }).toInt(),
    body('height').optional().isInt({ min: 1 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { entity_type, entity_id, type, storage_key, url, mime_type, size_bytes, width, height } = req.body

    const { rows: [asset] } = await pool.query(
      `INSERT INTO media_assets
         (owner_id, entity_type, entity_id, type, storage_key, url, mime_type, size_bytes, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.sub, entity_type, entity_id, type, storage_key, url,
       mime_type ?? null, size_bytes ?? null, width ?? null, height ?? null]
    )

    res.status(201).json(asset)
  })
)

// DELETE /api/media/:id
router.delete(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const { rows: [asset] } = await pool.query(
      `SELECT id FROM media_assets WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.sub]
    )
    if (!asset) throw new AppError('Media asset not found', 404)

    // Stub: in production we'd also delete from S3 here
    await pool.query(`DELETE FROM media_assets WHERE id = $1`, [req.params.id])

    res.status(204).send()
  })
)

export default router
