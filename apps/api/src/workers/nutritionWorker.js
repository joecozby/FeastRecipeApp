import logger from '../config/logger.js'

/**
 * Nutrition worker — stub acceptable for MVP.
 * In production this would:
 *  - Listen on a 'nutrition' BullMQ queue
 *  - For each recipe_id, load its resolved ingredients
 *  - Call USDA FoodData Central API with USDA_API_KEY
 *  - Aggregate per-serving macros (calories, protein, fat, carbs, fiber)
 *  - Upsert a nutrition_snapshots row
 */
export function startNutritionWorker() {
  logger.info('Nutrition worker: stub mode — USDA lookup not active')
  return null
}
