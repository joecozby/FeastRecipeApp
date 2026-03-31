import logger from '../config/logger.js'

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1'

// Nutrient IDs from USDA FoodData Central
const NUTRIENT_IDS = {
  calories: 1008,
  protein:  1003,
  fat:      1004,
  carbs:    1005,
  fiber:    1079,
  sodium:   1093,
}

/**
 * Search USDA FoodData Central for an ingredient and return
 * its macros per 100g. Returns null if not found or API is unavailable.
 */
export async function searchFoodNutrients(query, apiKey) {
  try {
    const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&api_key=${apiKey}&pageSize=1&dataType=Foundation,SR%20Legacy`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      logger.warn(`USDA API error ${res.status} for query "${query}"`)
      return null
    }
    const data = await res.json()
    const food = data.foods?.[0]
    if (!food) {
      logger.debug(`USDA: no results for "${query}"`)
      return null
    }

    const result = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium: 0 }
    for (const n of food.foodNutrients ?? []) {
      for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
        if (n.nutrientId === id) result[key] = n.value ?? 0
      }
    }

    logger.debug(`USDA: matched "${query}" → "${food.description}"`)
    return result
  } catch (err) {
    logger.warn(`USDA lookup failed for "${query}": ${err.message}`)
    return null
  }
}
