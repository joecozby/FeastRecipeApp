import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import logger from '../config/logger.js'

// ---------------------------------------------------------------------------
// HTML entity decoder
// Handles both named entities (&amp; &rsquo; etc.) and numeric refs (&#39; &#x27;)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str
  return str
    // Named entities most commonly found in recipe JSON-LD
    .replace(/&amp;/gi,    '&')
    .replace(/&lt;/gi,     '<')
    .replace(/&gt;/gi,     '>')
    .replace(/&quot;/gi,   '"')
    .replace(/&apos;/gi,   "'")
    .replace(/&#39;/g,     "'")
    .replace(/&nbsp;/gi,   ' ')
    .replace(/&rsquo;/gi,  '\u2019')   // '
    .replace(/&lsquo;/gi,  '\u2018')   // '
    .replace(/&rdquo;/gi,  '\u201D')   // "
    .replace(/&ldquo;/gi,  '\u201C')   // "
    .replace(/&ndash;/gi,  '\u2013')   // –
    .replace(/&mdash;/gi,  '\u2014')   // —
    .replace(/&hellip;/gi, '\u2026')   // …
    .replace(/&deg;/gi,    '\u00B0')   // °
    .replace(/&frac12;/gi, '\u00BD')   // ½
    .replace(/&frac14;/gi, '\u00BC')   // ¼
    .replace(/&frac34;/gi, '\u00BE')   // ¾
    // Decimal numeric references  &#160;
    .replace(/&#(\d+);/g,      (_, n)   => String.fromCharCode(parseInt(n, 10)))
    // Hex numeric references  &#x27;
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

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
    // Handle both PT1H30M and P0DT1H30M (day component present)
    const m = iso.match(/P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/)
    if (!m) return null
    const mins = (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0)
    return mins > 0 ? mins : null
  }

  const toArray = (v) => {
    if (!v) return []
    return Array.isArray(v) ? v : [v]
  }

  const ingredients = toArray(node.recipeIngredient).map((t) => ({
    raw_text: decodeHtmlEntities(String(t).trim()),
  }))

  const instructions = toArray(node.recipeInstructions).flatMap((item, i) => {
    // HowToStep
    if (item['@type'] === 'HowToStep') {
      return [{ step_number: i + 1, body: decodeHtmlEntities(item.text || item.name || '') }]
    }
    // HowToSection — flatten its sub-steps
    if (item['@type'] === 'HowToSection') {
      return toArray(item.itemListElement).map((step, j) => ({
        step_number: i * 100 + j + 1,
        body: decodeHtmlEntities(step.text || step.name || ''),
        group_label: decodeHtmlEntities(item.name || null),
      }))
    }
    // Plain string
    return [{ step_number: i + 1, body: decodeHtmlEntities(String(item).trim()) }]
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
    title: decodeHtmlEntities(node.name || null),
    description: decodeHtmlEntities(node.description || null),
    servings,
    prep_time_mins: duration(node.prepTime),
    cook_time_mins: duration(node.cookTime),
    cuisine: toArray(node.recipeCuisine)[0] || null,
    difficulty: null,
    tags: toArray(node.recipeCategory).concat(
      Array.isArray(node.keywords)
        ? node.keywords
        : (node.keywords ? String(node.keywords).split(',') : [])
    ),
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
  const $ = cheerio.load(html)

  // Always extract og:image — it's a reliable fallback since sites serve it
  // for social sharing and rarely block direct downloads of it.
  const ogImage = $('meta[property="og:image"]').attr('content') || null

  const jsonLdNode = extractJsonLd(html)

  if (jsonLdNode) {
    logger.debug('Found JSON-LD recipe', { url })
    const result = fromJsonLd(jsonLdNode, url)
    // Fill in og:image if JSON-LD didn't provide one, and always carry it
    // as a fallback so the worker can try it if the primary URL is blocked.
    if (!result.cover_image_url) result.cover_image_url = ogImage
    result.og_image = ogImage
    return result
  }

  logger.debug('No JSON-LD found — falling back to meta tags + page text', { url })
  const meta = fromMetaTags($, url)
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
