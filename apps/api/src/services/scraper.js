import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import logger from '../config/logger.js'

const WEB_USER_AGENT =
  'Mozilla/5.0 (compatible; FeastBot/1.0; +https://feastapp.io/bot)'
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const FETCH_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function fetchHtml(url, userAgent) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
      redirect: 'follow',
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// JSON-LD recipe extractor
// ---------------------------------------------------------------------------

function extractJsonLd(html) {
  const $ = cheerio.load(html)
  const scripts = $('script[type="application/ld+json"]')

  for (let i = 0; i < scripts.length; i++) {
    try {
      const raw = $(scripts[i]).html()
      const data = JSON.parse(raw)

      // Handle @graph arrays
      const candidates = Array.isArray(data['@graph'])
        ? data['@graph']
        : [data]

      for (const node of candidates) {
        const type = node['@type']
        const types = Array.isArray(type) ? type : [type]
        if (types.includes('Recipe')) return node
      }
    } catch {
      // malformed JSON-LD — try next script tag
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// JSON-LD → structured scrape result
// ---------------------------------------------------------------------------

function fromJsonLd(node, sourceUrl) {
  const duration = (iso) => {
    if (!iso) return null
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    if (!m) return null
    return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0)
  }

  const toArray = (v) => {
    if (!v) return []
    return Array.isArray(v) ? v : [v]
  }

  const ingredients = toArray(node.recipeIngredient).map((t) => ({
    raw_text: String(t).trim(),
  }))

  const instructions = toArray(node.recipeInstructions).flatMap((item, i) => {
    // HowToStep
    if (item['@type'] === 'HowToStep') {
      return [{ step_number: i + 1, body: item.text || item.name || '' }]
    }
    // HowToSection — flatten its sub-steps
    if (item['@type'] === 'HowToSection') {
      return toArray(item.itemListElement).map((step, j) => ({
        step_number: i * 100 + j + 1,
        body: step.text || step.name || '',
        group_label: item.name || null,
      }))
    }
    // Plain string
    return [{ step_number: i + 1, body: String(item).trim() }]
  }).filter((s) => s.body)

  // Re-number steps sequentially
  instructions.forEach((s, idx) => { s.step_number = idx + 1 })

  const servings = (() => {
    const y = node.recipeYield
    if (!y) return null
    const arr = Array.isArray(y) ? y : [y]
    const n = parseInt(arr[0])
    return isNaN(n) ? null : n
  })()

  return {
    title: node.name || null,
    description: node.description || null,
    servings,
    prep_time_mins: duration(node.prepTime),
    cook_time_mins: duration(node.cookTime),
    cuisine: toArray(node.recipeCuisine)[0] || null,
    difficulty: null,
    tags: toArray(node.recipeCategory).concat(toArray(node.keywords?.split?.(',') ?? [])),
    source_url: sourceUrl,
    cover_image_url: node.image
      ? (Array.isArray(node.image) ? node.image[0]?.url ?? node.image[0] : node.image?.url ?? node.image)
      : null,
    ingredients,
    instructions,
  }
}

// ---------------------------------------------------------------------------
// Fallback: meta-tag extraction when no JSON-LD found
// ---------------------------------------------------------------------------

function fromMetaTags($, sourceUrl) {
  const meta = (name) =>
    $(`meta[property="${name}"]`).attr('content') ||
    $(`meta[name="${name}"]`).attr('content') ||
    null

  return {
    title: meta('og:title') || $('title').text() || null,
    description: meta('og:description') || meta('description') || null,
    servings: null,
    prep_time_mins: null,
    cook_time_mins: null,
    cuisine: null,
    difficulty: null,
    tags: [],
    source_url: sourceUrl,
    cover_image_url: meta('og:image') || null,
    ingredients: [],
    instructions: [],
  }
}

// ---------------------------------------------------------------------------
// Public: scrape a web URL
// ---------------------------------------------------------------------------

// Extract meaningful text from the page for AI fallback parsing
function extractPageText($) {
  // Remove noise elements
  $('script, style, nav, header, footer, noscript, iframe, [aria-hidden="true"]').remove()

  // Prefer recipe/article content areas if they exist
  const contentSelectors = [
    '[class*="recipe"]', '[id*="recipe"]',
    '[class*="ingredient"]', '[class*="instruction"]', '[class*="direction"]',
    'article', 'main', '.entry-content', '.post-content',
  ]
  for (const sel of contentSelectors) {
    const el = $(sel).first()
    if (el.length) {
      const text = el.text().replace(/\s+/g, ' ').trim()
      if (text.length > 300) return text.slice(0, 10000)
    }
  }

  // Fall back to full body text
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 10000)
}

export async function scrapeUrl(url) {
  logger.debug('Scraping URL', { url })

  const html = await fetchHtml(url, WEB_USER_AGENT)
  const jsonLdNode = extractJsonLd(html)

  if (jsonLdNode) {
    logger.debug('Found JSON-LD recipe', { url })
    return fromJsonLd(jsonLdNode, url)
  }

  logger.debug('No JSON-LD found — falling back to meta tags + page text', { url })
  const $ = cheerio.load(html)
  const meta = fromMetaTags($, url)
  // Attach full page text so the import worker can send it to the AI parser
  meta.raw_page_text = extractPageText($)
  return meta
}

// ---------------------------------------------------------------------------
// Public: scrape an Instagram post URL
// ---------------------------------------------------------------------------

export async function scrapeInstagram(url) {
  logger.debug('Scraping Instagram', { url })

  let html
  try {
    html = await fetchHtml(url, MOBILE_USER_AGENT)
  } catch (err) {
    logger.warn('Instagram fetch failed', { error: err.message })
    throw new Error('INSTAGRAM_BLOCKED')
  }

  const $ = cheerio.load(html)
  const caption =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    null

  if (!caption || caption.length < 20) {
    throw new Error('INSTAGRAM_BLOCKED')
  }

  return {
    title: null,
    description: caption,
    servings: null,
    prep_time_mins: null,
    cook_time_mins: null,
    cuisine: null,
    difficulty: null,
    tags: [],
    source_url: url,
    cover_image_url: $('meta[property="og:image"]').attr('content') || null,
    // Raw caption passed as text — AI parser will extract ingredients/steps
    raw_caption: caption,
    ingredients: [],
    instructions: [],
  }
}
