import { Worker, Queue } from 'bullmq'
import pool from '../config/db.js'
import { newRedisConnection } from '../config/redis.js'
import logger from '../config/logger.js'
import { searchFoodNutrients } from '../services/usdaService.js'
import { toGrams } from '../services/unitConverter.js'

// Exported so other modules can enqueue nutrition jobs
export const nutritionQueue = new Queue('nutrition', {
  connection: newRedisConnection(),
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 30000 } },
})

// On-demand: always creates a fresh job so ingredient/servings edits are never silently dropped.
// No fixed jobId — BullMQ generates a unique ID each time.
export async function enqueueNutrition(recipeId) {
  await nutritionQueue.add(
    'compute',
    { recipe_id: recipeId },
    { removeOnComplete: 20, removeOnFail: 10 }
  )
}

// Backfill-only: stable jobId so the startup query doesn't double-queue a recipe
// that already has a pending job in the queue.
export async function enqueueNutritionBackfill(recipeId) {
  await nutritionQueue.add(
    'compute',
    { recipe_id: recipeId },
    { jobId: `nutrition-backfill-${recipeId}`, removeOnComplete: 20, removeOnFail: 10 }
  )
}

export function startNutritionWorker() {
  const { USDA_API_KEY } = process.env
  if (!USDA_API_KEY) {
    logger.info('Nutrition worker: no USDA_API_KEY set — skipping')
    return null
  }

  const worker = new Worker(
    'nutrition',
    async (job) => {
      const { recipe_id } = job.data
      logger.info(`Computing nutrition for recipe ${recipe_id}`)

      const { rows: [recipe] } = await pool.query(
        `SELECT id, base_servings FROM recipes WHERE id = $1 AND deleted_at IS NULL`,
        [recipe_id]
      )
      if (!recipe) return

      const { rows: ingredients } = await pool.query(
        `SELECT ri.quantity, ri.unit, ri.raw_text, i.canonical_name
         FROM recipe_ingredients ri
         LEFT JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE ri.recipe_id = $1`,
        [recipe_id]
      )

      const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium: 0 }
      let matched = 0

      for (const ing of ingredients) {
        const grams = toGrams(ing.quantity, ing.unit)
        if (!grams) continue

        const term = ing.canonical_name || ing.raw_text
        const nutrients = await searchFoodNutrients(term, USDA_API_KEY)
        if (!nutrients) continue

        const factor = grams / 100
        for (const key of Object.keys(totals)) {
          totals[key] += (nutrients[key] ?? 0) * factor
        }
        matched++
      }

      if (matched === 0) {
        logger.warn(`Nutrition: no ingredients matched for recipe ${recipe_id}`)
        return
      }

      const servings = Math.max(1, recipe.base_servings || 1)
      const perServing = {}
      for (const [key, val] of Object.entries(totals)) {
        perServing[key] = Math.round(val / servings)
      }

      await pool.query(
        `INSERT INTO nutrition_snapshots (recipe_id, total_nutrients, per_serving, computed_at, is_estimated)
         VALUES ($1, $2, $3, now(), true)
         ON CONFLICT (recipe_id) DO UPDATE SET
           total_nutrients = EXCLUDED.total_nutrients,
           per_serving     = EXCLUDED.per_serving,
           computed_at     = EXCLUDED.computed_at,
           is_estimated    = true`,
        [recipe_id, JSON.stringify(totals), JSON.stringify(perServing)]
      )

      logger.info(`Nutrition saved for ${recipe_id}: ${matched}/${ingredients.length} ingredients resolved`)
    },
    {
      connection: newRedisConnection(),
      concurrency: 2,
    }
  )

  worker.on('failed', (job, err) => {
    logger.error(`Nutrition job ${job?.id} failed: ${err.message}`)
  })

  logger.info('Nutrition worker started')

  // Backfill: enqueue any recipe that has no snapshot yet
  pool.query(
    `SELECT r.id FROM recipes r
     LEFT JOIN nutrition_snapshots ns ON ns.recipe_id = r.id
     WHERE r.deleted_at IS NULL AND ns.recipe_id IS NULL`
  ).then(({ rows }) => {
    if (!rows.length) return
    logger.info(`Nutrition backfill: enqueuing ${rows.length} recipes without snapshots`)
    return Promise.all(rows.map(r => enqueueNutritionBackfill(r.id).catch(() => {})))
  }).catch(err => logger.warn(`Nutrition backfill query failed: ${err.message}`))

  return worker
}
