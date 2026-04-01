import pool from '../config/db.js'

// ---------------------------------------------------------------------------
// Unit normalization map
// ---------------------------------------------------------------------------

const UNIT_MAP = {
  // volume
  tbsp: 'tablespoon', tbsps: 'tablespoon', tablespoons: 'tablespoon',
  tsp: 'teaspoon', tsps: 'teaspoon', teaspoons: 'teaspoon',
  c: 'cup', cups: 'cup',
  fl: 'fluid ounce', 'fl oz': 'fluid ounce', 'fluid ounces': 'fluid ounce',
  pt: 'pint', pints: 'pint',
  qt: 'quart', quarts: 'quart',
  gal: 'gallon', gallons: 'gallon',
  ml: 'ml', mls: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml',
  l: 'liter', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  // weight
  oz: 'ounce', ozs: 'ounce', ounces: 'ounce',
  lb: 'pound', lbs: 'pound', pounds: 'pound',
  g: 'gram', gr: 'gram', grams: 'gram', gramme: 'gram', grammes: 'gram',
  kg: 'kilogram', kgs: 'kilogram', kilograms: 'kilogram', kilogramme: 'kilogram',
  // misc
  pkg: 'package', pkgs: 'package', packages: 'package',
  can: 'can', cans: 'can',
  bunch: 'bunch', bunches: 'bunch',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  sprig: 'sprig', sprigs: 'sprig',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  drop: 'drop', drops: 'drop',
}

// Preparation terms to extract from ingredient name
const PREP_TERMS = [
  'chopped', 'finely chopped', 'roughly chopped', 'coarsely chopped',
  'minced', 'diced', 'sliced', 'thinly sliced', 'thickly sliced',
  'grated', 'finely grated', 'shredded',
  'crushed', 'peeled', 'julienned', 'halved', 'quartered',
  'cubed', 'trimmed', 'cleaned', 'rinsed', 'drained',
  'softened', 'melted', 'room temperature',
  'toasted', 'roasted',
]
// Sort longest first so "finely chopped" matches before "chopped"
PREP_TERMS.sort((a, b) => b.length - a.length)

// ---------------------------------------------------------------------------
// Quantity parsing — handles fractions, unicode fractions, mixed numbers
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1/3, '⅔': 2/3,
  '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1/6, '⅚': 5/6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

export function parseQuantity(str) {
  if (!str) return null
  let s = str.trim()

  // Replace unicode fractions
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replace(ch, ` ${val}`)
  }

  s = s.trim()

  // Mixed number: "1 1/2" or "1-1/2"
  const mixed = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/)
  if (mixed) {
    return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3])
  }

  // Simple fraction: "1/2"
  const fraction = s.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    return parseFloat(fraction[1]) / parseFloat(fraction[2])
  }

  // Plain number or decimal
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

// ---------------------------------------------------------------------------
// Parse a raw ingredient string into structured fields
// ---------------------------------------------------------------------------

export function parseRawText(rawText) {
  let text = rawText.trim()

  // --- 1. Extract quantity ---
  let quantity = null
  const qtyPatterns = [
    // Mixed number with unicode fraction: "1½"
    /^([\d]+[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
    // Mixed number: "1 1/2" or "1-1/2"
    /^(\d+[\s-]+\d+\/\d+)/,
    // Fraction: "1/2"
    /^(\d+\/\d+)/,
    // Unicode fraction only: "½"
    /^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
    // Decimal or integer
    /^([\d.]+)/,
  ]
  for (const pattern of qtyPatterns) {
    const m = text.match(pattern)
    if (m) {
      quantity = parseQuantity(m[1])
      text = text.slice(m[0].length).trim()
      break
    }
  }

  // --- 2. Extract unit ---
  let unit = null
  const unitWords = text.split(/[\s,]+/)
  if (unitWords.length > 0) {
    const candidate = unitWords[0].toLowerCase().replace(/[.,]$/, '')
    if (UNIT_MAP[candidate]) {
      unit = UNIT_MAP[candidate]
      text = text.slice(unitWords[0].length).trim().replace(/^,\s*/, '')
    }
  }

  // --- 3. Extract notes in parentheses ---
  let notes = null
  const notesMatch = text.match(/\(([^)]+)\)/)
  if (notesMatch) {
    notes = notesMatch[1].trim()
    text = text.replace(notesMatch[0], '').trim()
  }

  // --- 4. Extract preparation terms ---
  let preparation = null
  const lc = text.toLowerCase()
  for (const term of PREP_TERMS) {
    // Match as whole word/phrase
    const re = new RegExp(`(?:,\\s*|\\s+)(${term})(?:$|,|\\s)`, 'i')
    const m = lc.match(re)
    if (m) {
      preparation = term
      text = text.replace(re, ' ').trim().replace(/,\s*$/, '').trim()
      break
    }
  }

  // --- 5. Clean the remaining name ---
  const name = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // strip punctuation except hyphens
    .replace(/\s+/g, ' ')
    .trim()

  return { quantity, unit, name, preparation, notes }
}

// ---------------------------------------------------------------------------
// Qualifier words that can be stripped from ingredient names before matching.
// These are size, state, or quality descriptors that don't change WHICH
// ingredient something is — only how it's described.
//
// Deliberately excludes flavor/variety words (sweet, dark, green, black, red,
// white, smoked) because those often define a DIFFERENT ingredient
// (e.g. "sweet potato" ≠ "potato", "black pepper" ≠ "pepper").
// ---------------------------------------------------------------------------

const QUALIFIER_WORDS = new Set([
  // size
  'small', 'medium', 'large', 'extra', 'baby', 'mini', 'jumbo', 'big',
  // fat/oil quality (extra-virgin → virgin → olive oil)
  'virgin', 'pure', 'refined', 'unrefined', 'cold', 'pressed',
  // production descriptors
  'organic', 'wild', 'natural', 'raw', 'whole',
  // state
  'fresh', 'dried', 'frozen', 'thawed', 'canned', 'cooked', 'uncooked',
  // misc common qualifiers
  'boneless', 'skinless', 'unsalted', 'salted', 'plain',
])

/**
 * Strip leading/embedded qualifier words and hyphens from an ingredient name.
 * Returns the stripped string, or null if nothing was removed (to avoid
 * unnecessary DB queries).
 *
 * Examples:
 *   "small garlic clove"      → "garlic clove"
 *   "extra-virgin olive oil"  → "olive oil"
 *   "fresh cilantro"          → "cilantro"
 *   "sweet potato"            → null  (sweet not in QUALIFIER_WORDS)
 */
function stripQualifiers(name) {
  // Split on both spaces and hyphens so "extra-virgin" → ["extra","virgin"]
  const words = name.split(/[\s-]+/)
  const filtered = words.filter((w) => !QUALIFIER_WORDS.has(w.toLowerCase()))
  const stripped = filtered.join(' ').trim()
  // Only return if we actually removed something and still have a non-empty name
  return stripped && stripped !== name ? stripped : null
}

// ---------------------------------------------------------------------------
// findIngredient — lookup only, never creates a new row
// ---------------------------------------------------------------------------

async function findIngredient(clean) {
  // 1. Exact alias match
  const { rows: aliasRows } = await pool.query(
    `SELECT i.id, i.canonical_name
     FROM ingredient_aliases ia
     JOIN ingredients i ON i.id = ia.ingredient_id
     WHERE lower(ia.alias) = $1
     LIMIT 1`,
    [clean]
  )
  if (aliasRows.length) return aliasRows[0]

  // 2. Exact canonical name match
  const { rows: exactRows } = await pool.query(
    `SELECT id, canonical_name FROM ingredients WHERE lower(canonical_name) = $1 LIMIT 1`,
    [clean]
  )
  if (exactRows.length) return exactRows[0]

  // 3. Fuzzy trigram similarity > 0.5
  const { rows: fuzzyRows } = await pool.query(
    `SELECT id, canonical_name, similarity(canonical_name, $1) AS sim
     FROM ingredients
     WHERE similarity(canonical_name, $1) > 0.5
     ORDER BY sim DESC
     LIMIT 1`,
    [clean]
  )
  if (fuzzyRows.length) return fuzzyRows[0]

  return null
}

// ---------------------------------------------------------------------------
// Resolve ingredient name → ingredients table row
// ---------------------------------------------------------------------------

export async function resolveIngredient(name) {
  if (!name) return null

  const clean = name.toLowerCase().trim()

  // Pass 1: try the full cleaned name
  const found = await findIngredient(clean)
  if (found) return found

  // Pass 2: strip qualifier adjectives and try again
  // e.g. "small garlic clove" → "garlic clove" → matches "garlic" at 0.70
  //      "extra-virgin olive oil" → "olive oil" → exact match
  const stripped = stripQualifiers(clean)
  if (stripped) {
    const strippedFound = await findIngredient(stripped)
    if (strippedFound) return strippedFound
  }

  // Pass 3: no match at all — create a new canonical ingredient
  const { rows: [newIng] } = await pool.query(
    `INSERT INTO ingredients (canonical_name)
     VALUES ($1)
     ON CONFLICT (canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
     RETURNING id, canonical_name`,
    [clean]
  )
  return newIng
}

// ---------------------------------------------------------------------------
// Main export — normalise a parsed ingredient and resolve to DB row
// ---------------------------------------------------------------------------

export async function normalizeIngredient(rawText) {
  const parsed = parseRawText(rawText)
  const resolved = await resolveIngredient(parsed.name)

  return {
    raw_text: rawText,           // always preserved — never overwritten
    quantity: parsed.quantity,
    unit: parsed.unit,
    preparation: parsed.preparation,
    notes: parsed.notes,
    ingredient_id: resolved?.id ?? null,
    resolved_name: resolved?.canonical_name ?? parsed.name,
  }
}
