import logger from '../config/logger.js'

// ---------------------------------------------------------------------------
// Stub response — used when ANTHROPIC_API_KEY is not set.
// Matches the exact schema the real parser returns so the rest of the
// import pipeline runs end-to-end during development.
// ---------------------------------------------------------------------------

const STUB_RESPONSE = {
  title: 'Stub Recipe (AI Parser Not Connected)',
  description: 'This is a stub response returned when ANTHROPIC_API_KEY is not configured.',
  servings: 4,
  prep_time_mins: 10,
  cook_time_mins: 20,
  cuisine: 'American',
  difficulty: 'easy',
  tags: ['dinner', 'quick'],
  source_url: null,
  ingredients: [
    {
      raw_text: '2 cups all-purpose flour',
      quantity: 2,
      unit: 'cup',
      name: 'all-purpose flour',
      preparation: null,
      notes: null,
      is_optional: false,
      group_label: null,
      confidence: 1,
      ambiguous: false,
    },
    {
      raw_text: '1 tsp salt',
      quantity: 1,
      unit: 'teaspoon',
      name: 'salt',
      preparation: null,
      notes: null,
      is_optional: false,
      group_label: null,
      confidence: 1,
      ambiguous: false,
    },
    {
      raw_text: '2 tbsp olive oil',
      quantity: 2,
      unit: 'tablespoon',
      name: 'olive oil',
      preparation: null,
      notes: null,
      is_optional: false,
      group_label: null,
      confidence: 1,
      ambiguous: false,
    },
  ],
  instructions: [
    { step_number: 1, body: 'Mix the dry ingredients together in a large bowl.', group_label: null },
    { step_number: 2, body: 'Add the olive oil and mix until combined.', group_label: null },
    { step_number: 3, body: 'Cook according to your preference.', group_label: null },
  ],
}

// ---------------------------------------------------------------------------
// System prompt for the real Claude call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a recipe parser. Extract structured recipe data from the provided text.
Return ONLY valid JSON matching this exact schema — no markdown, no explanation:

{
  "title": "string",
  "description": "string | null",
  "servings": "number | null",
  "prep_time_mins": "number | null",
  "cook_time_mins": "number | null",
  "cuisine": "string | null",
  "difficulty": "easy | medium | hard | null",
  "tags": ["string"],
  "source_url": "string | null",
  "ingredients": [{
    "raw_text": "string",
    "quantity": "number | null",
    "unit": "string | null",
    "name": "string",
    "preparation": "string | null",
    "notes": "string | null",
    "is_optional": "boolean",
    "group_label": "string | null",
    "confidence": "number between 0-1",
    "ambiguous": "boolean"
  }],
  "instructions": [{
    "step_number": "number",
    "body": "string",
    "group_label": "string | null"
  }]
}

Ingredient parsing rules — read carefully:

QUANTITY
- Convert fractions to decimals: 1/2 → 0.5, 1/4 → 0.25
- For ranges like "4-5" or "1-2", use the average: (4+5)/2 = 4.5, (1+2)/2 = 1.5
- Ignore ordinal suffixes: "1/4th tsp" → quantity 0.25, unit "teaspoon"

UNIT
- Fully spell out all abbreviations: tbsp → tablespoon, tsp → teaspoon, gm/g → gram, kg → kilogram, oz → ounce, lb → pound, ml → milliliter

NAME — this is the most important field to get right:
- name must contain ONLY the core ingredient word(s) — nothing else
- NEVER include quantity, unit, or any abbreviation thereof in name ("cup", "gm", "tsp", "kg" etc. must NOT appear in name)
- NEVER include the preparation term in name if it is already in the preparation field
- NEVER include "optional", "as needed", "to taste", "if needed", or "to serve" in name
- Correct common spelling errors: "dessicated" → "desiccated", "tumeric" → "turmeric"
- Examples of correct name extraction:
    "2 large onions, fried"        → name: "onions",  preparation: "fried"
    "4-5 green chillies, slit"     → name: "green chillies", preparation: "slit"
    "1/2 cup desiccated coconut"   → name: "desiccated coconut"  (no "cup" in name)
    "250 gm yoghurt"               → name: "yoghurt"  (no "gm" in name)
    "1/4th tsp red food color"     → name: "red food color"  (no "tsp" in name)
    "1 kg chicken, cut into medium pieces" → name: "chicken", preparation: "cut into medium pieces"
    "oil, as needed"               → name: "oil",  notes: null (not "oil as needed")
    "salt, to taste"               → name: "salt", notes: null (not "salt to taste")
    "juice of 1 lemon"             → name: "lemon juice", quantity: 1, notes: null

PREPARATION
- preparation is a cooking/prep method: chopped, fried, slit, minced, sliced, cut into pieces, etc.
- Do NOT repeat the preparation term in name

OPTIONAL / NOTES
- is_optional = true if ingredient says "optional"; do NOT also put "optional" in notes
- notes is for genuinely supplementary context (e.g. "available at Indian grocery stores")
- Do NOT put "as needed", "to taste", "optional", or "if needed" in notes; those belong in is_optional or are stripped

FAITHFULNESS
- Extract ingredient names exactly as written — do not substitute similar ingredients
- "lemon" ≠ "lime"; "cream" ≠ "milk"; extract what is written
- raw_text must be the original ingredient string, completely unchanged

OTHER
- confidence is your certainty that the ingredient was correctly parsed (0-1)
- ambiguous is true if the ingredient string was genuinely unclear
- instructions must be in order with sequential step_number values
- tags should be lowercase, relevant meal-type or dietary labels only

Ingredient group_label rules:
- Use group_label when a recipe has distinct sub-components with 3 or more ingredients each (e.g. a marinade, a sauce, a dough, a spice rub, a topping)
- Label examples: "Marinade", "Sauce", "For the Dough", "Spice Blend", "Topping", "For the Chicken"
- All ingredients in the same group must share the same group_label string exactly
- Leave group_label null for simple recipes where all ingredients serve one unified purpose
- Do not create a group just because a recipe has many ingredients — only group when sub-components are genuinely distinct

Instruction group_label rules:
- Use group_label when instructions fall into clearly distinct phases (e.g. prep, cook, assemble, rest)
- Label examples: "Marinate", "Make the Sauce", "Cook the Chicken", "Assemble", "For the Dough", "Bake", "Finishing"
- All steps within the same phase must share the same group_label string exactly
- Leave group_label null for simple linear recipes (fewer than ~8 steps or no natural phases)
- Do not force sections onto recipes that flow as one continuous process

General group_label style: short, title-case, no trailing colon, no numbering`

// ---------------------------------------------------------------------------
// Unit words that should never appear at the start of an ingredient name
// (belt-and-suspenders for when the AI accidentally includes them)
// ---------------------------------------------------------------------------
const UNIT_WORDS_IN_NAME = new Set([
  'cup', 'cups', 'tablespoon', 'tablespoons', 'tbsp', 'tbsps',
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'gram', 'grams', 'g', 'gm', 'gms',
  'kilogram', 'kilograms', 'kg', 'kgs',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'milliliter', 'milliliters', 'ml',
  'liter', 'liters', 'l',
  'pint', 'pints', 'pt',
  'quart', 'quarts', 'qt',
])

// ---------------------------------------------------------------------------
// Real Claude API call
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [5000, 10000, 20000]

function isOverloaded(err) {
  // Anthropic SDK throws APIStatusError with status 529 when overloaded
  return err?.status === 529 || err?.message?.includes('overloaded') || err?.message?.includes('529')
}

async function callClaude(messages) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let lastErr
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
      })

      const content = message.content[0]
      if (content.type !== 'text') throw new Error('Unexpected response type from Claude')
      // Strip markdown code fences if Claude wraps the JSON despite instructions
      const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      return JSON.parse(raw)
    } catch (err) {
      lastErr = err
      if (isOverloaded(err) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]
        logger.warn(`Claude overloaded — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Parse unstructured recipe text into a structured ParsedRecipe object.
 *
 * Uses the Anthropic API when ANTHROPIC_API_KEY is set.
 * Falls back to a hardcoded stub so the pipeline runs without a key.
 */
// ---------------------------------------------------------------------------
// Post-parse HTML entity cleanup
// Belt-and-suspenders: catches any entities that sneak through on text/
// caption imports where the scraper's decoder wasn't in the path.
// ---------------------------------------------------------------------------

function decodeEntities(str) {
  if (!str || typeof str !== 'string') return str
  return str
    .replace(/&amp;/gi,    '&')
    .replace(/&lt;/gi,     '<')
    .replace(/&gt;/gi,     '>')
    .replace(/&quot;/gi,   '"')
    .replace(/&apos;/gi,   "'")
    .replace(/&#39;/g,     "'")
    .replace(/&nbsp;/gi,   ' ')
    .replace(/&rsquo;/gi,  '\u2019')
    .replace(/&lsquo;/gi,  '\u2018')
    .replace(/&rdquo;/gi,  '\u201D')
    .replace(/&ldquo;/gi,  '\u201C')
    .replace(/&ndash;/gi,  '\u2013')
    .replace(/&mdash;/gi,  '\u2014')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/&deg;/gi,    '\u00B0')
    .replace(/&#(\d+);/g,       (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi,(_, h) => String.fromCharCode(parseInt(h, 16)))
}

function sanitizeParsed(parsed) {
  if (!parsed) return parsed
  return {
    ...parsed,
    title:       decodeEntities(parsed.title),
    description: decodeEntities(parsed.description),
    ingredients: (parsed.ingredients || []).map((ing) => {
      let name        = (decodeEntities(ing.name) || '').trim()
      let notes       = decodeEntities(ing.notes)
      const prep      = decodeEntities(ing.preparation)
      const unit      = ing.unit || null

      // --- Strip unit word from the start of name ---
      // e.g. AI returned name="cup desiccated coconut" → "desiccated coconut"
      //      name="gm yoghurt" → "yoghurt"
      //      name="tsp red food color" → "red food color"
      const nameWords = name.toLowerCase().split(/\s+/)
      if (nameWords.length > 1 && UNIT_WORDS_IN_NAME.has(nameWords[0])) {
        name = name.slice(nameWords[0].length).trim()
      }
      // Also catch: name="th tsp red food color" (ordinal suffix leftover)
      if (/^(st|nd|rd|th)\s+/i.test(name)) {
        name = name.replace(/^(st|nd|rd|th)\s+/i, '').trim()
        // Then check again for unit word
        const afterOrdinal = name.toLowerCase().split(/\s+/)
        if (afterOrdinal.length > 1 && UNIT_WORDS_IN_NAME.has(afterOrdinal[0])) {
          name = name.slice(afterOrdinal[0].length).trim()
        }
      }

      // --- Strip prep term from end of name if AI duplicated it ---
      // e.g. preparation="fried", name="large onions fried" → "large onions"
      //      preparation="slit",  name="green chillies slit" → "green chillies"
      if (prep) {
        const prepLower = prep.toLowerCase()
        const nameLower = name.toLowerCase()
        if (nameLower.endsWith(prepLower)) {
          name = name.slice(0, name.length - prepLower.length).trim().replace(/,\s*$/, '').trim()
        }
        // Also handle comma-separated: "green chillies, slit" with prep="slit"
        const commaPrep = `,\\s*${prepLower.replace(/[-]/g, '[-]')}$`
        name = name.replace(new RegExp(commaPrep, 'i'), '').trim()
      }

      // --- Strip "optional" from notes when is_optional=true (avoids duplication) ---
      if (ing.is_optional && notes) {
        notes = notes.replace(/\boptional\b/gi, '').replace(/^[,;\s]+|[,;\s]+$/g, '').trim() || null
      }

      // --- Strip "as needed" / "to taste" from name if AI put them there ---
      name = name
        .replace(/,?\s*\bto\s+taste\b/gi, '')
        .replace(/,?\s*\bas\s+needed\b/gi, '')
        .replace(/,?\s*\bif\s+needed\b/gi, '')
        .replace(/,?\s*\boptional\b/gi, '')
        .trim()
        .replace(/,\s*$/, '')
        .trim()

      // --- Correct common spelling errors ---
      name = name
        .replace(/\bdessicated\b/gi, 'desiccated')
        .replace(/\btumeric\b/gi, 'turmeric')

      return {
        ...ing,
        raw_text:    decodeEntities(ing.raw_text),
        name:        name || decodeEntities(ing.name), // keep original if cleaning emptied it
        preparation: prep,
        notes,
        group_label: decodeEntities(ing.group_label),
      }
    }),
    instructions: (parsed.instructions || []).map((step) => ({
      ...step,
      body:        decodeEntities(step.body),
      group_label: decodeEntities(step.group_label),
    })),
  }
}

export async function parseRecipeText(text) {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — returning stub AI response')
    return STUB_RESPONSE
  }

  try {
    logger.debug('Calling Claude to parse recipe text')
    const parsed = await callClaude([
      { role: 'user', content: `Parse this recipe:\n\n${text}` },
    ])
    logger.debug('Claude parse complete', { title: parsed.title })
    return sanitizeParsed(parsed)
  } catch (err) {
    logger.error('Claude API call failed', { error: err.message })
    throw new Error(`AI parsing failed: ${err.message}`)
  }
}

/**
 * Parse a recipe from an image (photo of a recipe book, handwritten card, screenshot, etc.).
 *
 * @param {string} dataUrl  A data URL like "data:image/jpeg;base64,/9j/..."
 */
export async function parseRecipeImage(dataUrl) {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — returning stub AI response for image')
    return STUB_RESPONSE
  }

  // Parse data URL → media_type + raw base64
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s)
  if (!match) throw new Error('Invalid image data URL — expected data:image/jpeg|png|webp|gif;base64,...')
  const [, mediaType, base64Data] = match

  try {
    logger.debug('Calling Claude vision to parse recipe image')
    const parsed = await callClaude([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: 'Parse this recipe from the image. Extract all visible ingredients and instructions exactly as written.',
          },
        ],
      },
    ])
    logger.debug('Claude vision parse complete', { title: parsed.title })
    return sanitizeParsed(parsed)
  } catch (err) {
    logger.error('Claude vision API call failed', { error: err.message })
    throw new Error(`AI image parsing failed: ${err.message}`)
  }
}
