import { Worker } from 'bullmq'
import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'
import pool from '../config/db.js'
import { newRedisConnection } from '../config/redis.js'
import logger from '../config/logger.js'
import { scrapeUrl, scrapeInstagram } from '../services/scraper.js'
import { parseRecipeText } from '../services/aiParser.js'
import { normalizeIngredient } from '../services/ingredientNormalizer.js'
import { enqueueNutrition } from './nutritionWorker.js'

// Download an image URL and upload it to Cloudinary, then attach to the recipe.
// Failures are non-fatal — a missing cover photo shouldn't break the import.
async function attachCoverImage(recipeId, ownerId, imageUrl) {
  if (!imageUrl || !process.env.CLOUDINARY_URL) return
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'feast/recipe',
          transformation: [
            { width: 1200, height: 800, crop: 'fill', gravity: 'auto' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, r) => err ? reject(err) : resolve(r)
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
  } catch (err) {
    logger.warn(`Cover image upload failed for recipe ${recipeId}: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Pipeline step: save parsed + normalized recipe to DB
// ---------------------------------------------------------------------------

async function saveRecipe(userId, parsed, sourceUrl, rawImportData) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // --- Recipe row ---
    const { rows: [recipe] } = await client.query(
      `INSERT INTO recipes
         (owner_id, title, description, source_url, raw_import_data,
          cuisine, difficulty, prep_time_mins, cook_time_mins, base_servings, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
       RETURNING id`,
      [
        userId,
        parsed.title || 'Imported Recipe',
        parsed.description ?? null,
        sourceUrl ?? parsed.source_url ?? null,
        JSON.stringify(rawImportData),
        parsed.cuisine ?? null,
        parsed.difficulty ?? null,
        parsed.prep_time_mins ?? null,
        parsed.cook_time_mins ?? null,
        parsed.servings ?? null,
      ]
    )
    const recipeId = recipe.id

    // --- Ingredients (normalize each one) ---
    for (let i = 0; i < (parsed.ingredients ?? []).length; i++) {
      const ing = parsed.ingredients[i]
      const normalized = await normalizeIngredient(ing.raw_text || ing.name || '')

      await client.query(
        `INSERT INTO recipe_ingredients
           (recipe_id, ingredient_id, raw_text, quantity, unit,
            preparation, notes, is_optional, display_order, group_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          recipeId,
          normalized.ingredient_id ?? null,
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
    for (let i = 0; i < (parsed.instructions ?? []).length; i++) {
      const step = parsed.instructions[i]
      await client.query(
        `INSERT INTO instructions (recipe_id, step_number, body, group_label)
         VALUES ($1,$2,$3,$4)`,
        [recipeId, i + 1, step.body, step.group_label ?? null]
      )
    }

    // --- Tags (upsert by name) ---
    for (const rawTag of parsed.tags ?? []) {
      if (!rawTag) continue
      // Normalize: handle plain string, {name:...} object, or '{"name":"..."}' JSON string
      let tagName
      if (typeof rawTag === 'object' && rawTag !== null) {
        tagName = rawTag.name
      } else {
        const s = String(rawTag).trim()
        if (s.startsWith('{')) {
          try { tagName = JSON.parse(s).name } catch { tagName = s }
        } else {
          tagName = s
        }
      }
      if (!tagName) continue
      const { rows: [tag] } = await client.query(
        `INSERT INTO tags (name) VALUES (lower($1))
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [String(tagName).trim()]
      )
      await client.query(
        `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [recipeId, tag.id]
      )
    }

    await client.query('COMMIT')
    return recipeId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Pipeline: scrape → parse → save
// ---------------------------------------------------------------------------

async function processImportJob(jobId, userId, sourceType, sourceInput) {
  let scraped = null
  let textToParse = sourceInput
  let sourceUrl = null

  // Step 1 — Scrape (if applicable)
  if (sourceType === 'url') {
    logger.info('Import: scraping URL', { jobId, url: sourceInput })
    scraped = await scrapeUrl(sourceInput)
    sourceUrl = sourceInput

    // If scraper extracted full ingredients + instructions, skip AI
    if (scraped.ingredients.length > 0 && scraped.instructions.length > 0) {
      logger.info('Import: JSON-LD extraction successful, skipping AI parse', { jobId })
      const recipeId = await saveRecipe(userId, scraped, sourceUrl, scraped)
      return { recipeId, coverImageUrl: scraped.cover_image_url || null }
    }

    // Fall through to AI parse — use full page text if available, otherwise title+description
    textToParse = scraped.raw_page_text
      || [scraped.title, scraped.description].filter(Boolean).join('\n\n')
  }

  if (sourceType === 'instagram') {
    logger.info('Import: scraping Instagram', { jobId })
    scraped = await scrapeInstagram(sourceInput)
    sourceUrl = sourceInput
    textToParse = scraped.raw_caption || scraped.description || ''
  }

  // Step 2 — AI parse
  logger.info('Import: calling AI parser', { jobId, sourceType })
  const parsed = await parseRecipeText(textToParse)

  // Merge scraper metadata that AI wouldn't have (source_url, cover image, etc.)
  if (scraped) {
    parsed.source_url = parsed.source_url || sourceUrl
    parsed.cover_image_url = parsed.cover_image_url || scraped.cover_image_url || null
    if (!parsed.title && scraped.title) parsed.title = scraped.title
    if (!parsed.cuisine && scraped.cuisine) parsed.cuisine = scraped.cuisine
    if (!parsed.servings && scraped.servings) parsed.servings = scraped.servings
    if (!parsed.prep_time_mins && scraped.prep_time_mins) parsed.prep_time_mins = scraped.prep_time_mins
    if (!parsed.cook_time_mins && scraped.cook_time_mins) parsed.cook_time_mins = scraped.cook_time_mins
  }

  // Step 3 — Save
  const recipeId = await saveRecipe(userId, parsed, sourceUrl, { scraped, parsed })
  return { recipeId, coverImageUrl: parsed.cover_image_url || null }
}

// ---------------------------------------------------------------------------
// BullMQ worker
// ---------------------------------------------------------------------------

export function startImportWorker() {
  const worker = new Worker(
    'import',
    async (job) => {
      const { jobId, userId } = job.data

      logger.info('Import worker: processing job', { jobId, userId })

      // Load job details from DB
      const { rows: [dbJob] } = await pool.query(
        `SELECT source_type, source_input FROM import_jobs WHERE id = $1`,
        [jobId]
      )
      if (!dbJob) throw new Error(`Import job ${jobId} not found in DB`)

      // Mark as processing
      await pool.query(
        `UPDATE import_jobs SET status = 'processing', updated_at = now() WHERE id = $1`,
        [jobId]
      )

      let recipeId, coverImageUrl
      try {
        ;({ recipeId, coverImageUrl } = await processImportJob(
          jobId,
          userId,
          dbJob.source_type,
          dbJob.source_input
        ))
      } catch (err) {
        const errorMessage = err.message === 'INSTAGRAM_BLOCKED'
          ? 'INSTAGRAM_BLOCKED'
          : err.message

        await pool.query(
          `UPDATE import_jobs SET status = 'failed', error_message = $1, updated_at = now()
           WHERE id = $2`,
          [errorMessage, jobId]
        )

        logger.error('Import job failed', { jobId, error: err.message })
        throw err // re-throw so BullMQ records the failure
      }

      // Mark as done
      await pool.query(
        `UPDATE import_jobs
         SET status = 'done', recipe_id = $1, updated_at = now()
         WHERE id = $2`,
        [recipeId, jobId]
      )

      logger.info('Import job complete', { jobId, recipeId })
      enqueueNutrition(recipeId).catch(err => logger.warn(`Failed to enqueue nutrition: ${err.message}`))
      if (coverImageUrl) attachCoverImage(recipeId, userId, coverImageUrl)

      return { recipeId }
    },
    {
      connection: newRedisConnection(),
      concurrency: 3,
    }
  )

  worker.on('failed', (job, err) => {
    logger.error('Import worker job failed', { jobId: job?.data?.jobId, error: err.message })
  })

  worker.on('error', (err) => {
    logger.error('Import worker error', { error: err.message })
  })

  logger.info('Import worker started')
  return worker
}
