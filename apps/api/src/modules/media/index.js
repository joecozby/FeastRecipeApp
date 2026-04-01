import { Router } from 'express'
import { param } from 'express-validator'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
import pool from '../../config/db.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler, AppError } from '../../middleware/errorHandler.js'
import logger from '../../config/logger.js'

const router = Router()
router.use(requireAuth)

// Cloudinary is auto-configured from CLOUDINARY_URL env var
// (format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME)

// Multer: memory storage, 10MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'))
    }
    cb(null, true)
  },
})

// Upload a buffer to Cloudinary and return the result
function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [
          { width: 1200, height: 800, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      }
    )
    Readable.from(buffer).pipe(stream)
  })
}

// ---------------------------------------------------------------------------
// POST /api/media/upload  — upload image and attach to a recipe
// ---------------------------------------------------------------------------
router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded', 400)

    const { entity_type = 'recipe', entity_id } = req.body
    if (!entity_id) throw new AppError('entity_id is required', 400)
    if (!['recipe', 'profile', 'cookbook'].includes(entity_type)) {
      throw new AppError('Invalid entity_type', 400)
    }

    // Verify the entity belongs to this user
    if (entity_type === 'recipe') {
      const { rows } = await pool.query(
        `SELECT id FROM recipes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
        [entity_id, req.user.sub]
      )
      if (!rows.length) throw new AppError('Recipe not found', 404)
    }

    if (!process.env.CLOUDINARY_URL) {
      throw new AppError('Media uploads are not configured (CLOUDINARY_URL missing)', 503)
    }

    logger.info(`Uploading image to Cloudinary for ${entity_type}/${entity_id}`)
    const result = await uploadToCloudinary(req.file.buffer, `feast/${entity_type}`)

    // Save asset record
    const { rows: [asset] } = await pool.query(
      `INSERT INTO media_assets
         (owner_id, entity_type, entity_id, type, storage_key, url, mime_type, width, height)
       VALUES ($1,$2,$3,'image',$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user.sub,
        entity_type,
        entity_id,
        result.public_id,
        result.secure_url,
        req.file.mimetype,
        result.width,
        result.height,
      ]
    )

    // Set as cover on the recipe (and delete the old cover asset if one existed)
    if (entity_type === 'recipe') {
      const { rows: [old] } = await pool.query(
        `SELECT cover_media_id FROM recipes WHERE id = $1`,
        [entity_id]
      )

      await pool.query(
        `UPDATE recipes SET cover_media_id = $1, updated_at = now() WHERE id = $2`,
        [asset.id, entity_id]
      )

      // Clean up old Cloudinary asset if it exists
      if (old?.cover_media_id) {
        const { rows: [oldAsset] } = await pool.query(
          `SELECT storage_key FROM media_assets WHERE id = $1`,
          [old.cover_media_id]
        )
        if (oldAsset) {
          cloudinary.uploader.destroy(oldAsset.storage_key).catch(() => {})
          await pool.query(`DELETE FROM media_assets WHERE id = $1`, [old.cover_media_id])
        }
      }
    }

    logger.info(`Media uploaded: ${result.secure_url}`)
    res.status(201).json({ ...asset, cover_url: result.secure_url })
  })
)

// ---------------------------------------------------------------------------
// DELETE /api/media/:id
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  [param('id').isUUID(), validate],
  asyncHandler(async (req, res) => {
    const { rows: [asset] } = await pool.query(
      `SELECT * FROM media_assets WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.sub]
    )
    if (!asset) throw new AppError('Media asset not found', 404)

    // Delete from Cloudinary
    if (process.env.CLOUDINARY_URL) {
      await cloudinary.uploader.destroy(asset.storage_key).catch(() => {})
    }

    await pool.query(`DELETE FROM media_assets WHERE id = $1`, [req.params.id])

    // Clear cover_media_id on the recipe if this was the cover
    if (asset.entity_type === 'recipe') {
      await pool.query(
        `UPDATE recipes SET cover_media_id = NULL WHERE id = $1 AND cover_media_id = $2`,
        [asset.entity_id, asset.id]
      )
    }

    res.status(204).send()
  })
)

export default router
