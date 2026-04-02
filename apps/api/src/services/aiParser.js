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

Rules:
- raw_text must be the original ingredient string, unchanged
- quantity must be a decimal number (convert fractions: 1/2 → 0.5)
- unit must be fully spelled out (tbsp → tablespoon, tsp → teaspoon, etc.)
- preparation is a cooking method applied to the ingredient (chopped, minced, etc.)
- notes is anything in parentheses or after a comma that isn't quantity/unit/prep
- is_optional is true if the ingredient is marked as optional
- confidence is your certainty that the ingredient was correctly parsed (0-1)
- ambiguous is true if the ingredient string was unclear
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
    ingredients: (parsed.ingredients || []).map((ing) => ({
      ...ing,
      raw_text:    decodeEntities(ing.raw_text),
      name:        decodeEntities(ing.name),
      preparation: decodeEntities(ing.preparation),
      notes:       decodeEntities(ing.notes),
      group_label: decodeEntities(ing.group_label),
    })),
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
