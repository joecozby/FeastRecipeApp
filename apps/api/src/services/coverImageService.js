import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
import pool from '../config/db.js'
import logger from '../config/logger.js'

// ---------------------------------------------------------------------------
// Unsplash image search
// Requires UNSPLASH_ACCESS_KEY env var (free at unsplash.com/developers).
// Returns the URL of the best landscape food photo, or null on failure.
// ---------------------------------------------------------------------------
async function searchUnsplash(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return null

  try {
    // Append "food dish" so generic recipe titles like "Pasta" still get
    // a plated photo rather than a raw-ingredient shot.
    const q = encodeURIComponent(`${query} food dish`)
    const url =
      `https://api.unsplash.com/search/photos` +
      `?query=${q}&per_page=3&orientation=landscape&client_id=${key}`

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`Unsplash API returned ${res.status}`)

    const data = await res.json()
    // Prefer the first result; fall back to any result with a regular URL
    const photo = (data.results ?? []).find(p => p?.urls?.regular)
    return photo?.urls?.regular ?? null
  } catch (err) {
    logger.warn(`Unsplash search failed for "${query}": ${err.message}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Shared cover-image attachment
// Downloads imageUrl(s) in order, uploads the first success to Cloudinary,
// and sets cover_media_id on the recipe row.  Non-fatal — failures are logged.
// ---------------------------------------------------------------------------
export async function attachCoverImage(recipeId, ownerId, ...imageUrls) {
  if (!process.env.CLOUDINARY_URL) {
    logger.warn(`Cover image skipped for recipe ${recipeId}: CLOUDINARY_URL not set`)
    return
  }

  const candidates = imageUrls.filter(Boolean)
  if (!candidates.length) return

  for (const imageUrl of candidates) {
    try {
      logger.debug(`Cover image: trying ${imageUrl.startsWith('data:') ? '[data URL]' : imageUrl}`)

      let buffer
      if (imageUrl.startsWith('data:')) {
        // Photo import — decode base64 directly, no HTTP fetch needed
        const base64 = imageUrl.split(',')[1]
        if (!base64) throw new Error('Invalid data URL')
        buffer = Buffer.from(base64, 'base64')
      } else {
        const res = await fetch(imageUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeastBot/1.0)' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        buffer = Buffer.from(await res.arrayBuffer())
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'feast/recipe',
            transformation: [
              { width: 1200, height: 800, crop: 'fill', gravity: 'auto' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          },
          (err, r) => (err ? reject(err) : resolve(r))
        )
        Readable.from(buffer).pipe(stream)
      })

      const { rows: [asset] } = await pool.query(
        `INSERT INTO media_assets
           (owner_id, entity_type, entity_id, type, storage_key, url, width, height)
         VALUES ($1,'recipe',$2,'image',$3,$4,$5,$6)
         RETURNING id`,
        [ownerId, recipeId, result.public_id, result.secure_url, result.width, result.height]
      )
      await pool.query(
        `UPDATE recipes SET cover_media_id = $1 WHERE id = $2`,
        [asset.id, recipeId]
      )
      logger.info(`Cover image attached for recipe ${recipeId}: ${result.secure_url}`)
      return // success — stop trying further candidates
    } catch (err) {
      logger.warn(
        `Cover image download failed for ${imageUrl.startsWith('data:') ? '[data URL]' : imageUrl}: ` +
          `${err.message} — trying next candidate`
      )
    }
  }

  logger.warn(`Cover image: all ${candidates.length} candidate(s) failed for recipe ${recipeId}`)
}

// ---------------------------------------------------------------------------
// High-level helper used by the AI Chef after create_recipe.
// Searches Unsplash for a food photo matching the recipe title, then attaches
// it as the cover image.  Completely non-fatal.
// ---------------------------------------------------------------------------
export async function findAndAttachCoverImage(recipeId, ownerId, title) {
  try {
    const imageUrl = await searchUnsplash(title)
    if (!imageUrl) {
      logger.info(`No Unsplash photo found for "${title}" — recipe will use default cover`)
      return
    }
    await attachCoverImage(recipeId, ownerId, imageUrl)
  } catch (err) {
    logger.warn(`findAndAttachCoverImage failed for recipe ${recipeId}: ${err.message}`)
  }
}
