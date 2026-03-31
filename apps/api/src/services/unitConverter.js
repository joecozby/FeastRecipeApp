// Approximate grams per unit for ballpark nutrition estimates.
// Volume units use water density; solid ingredient density varies but
// this gives useful order-of-magnitude accuracy.
const UNIT_GRAMS = {
  // Volume
  cup: 240, cups: 240,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5,  teaspoon: 5,  teaspoons: 5,
  'fl oz': 30, 'fluid oz': 30, 'fluid ounce': 30, 'fluid ounces': 30,
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  // Weight
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  // Count (assume ~100g per unit as rough default)
  piece: 100, pieces: 100,
  slice: 30, slices: 30,
  clove: 5, cloves: 5,
  can: 400,
}

/**
 * Convert a quantity + unit to grams.
 * Returns null when conversion is not possible.
 */
export function toGrams(quantity, unit) {
  if (!quantity || Number(quantity) <= 0) return null
  if (!unit) return null
  const factor = UNIT_GRAMS[unit.toLowerCase().trim()]
  if (!factor) return null
  return Number(quantity) * factor
}
