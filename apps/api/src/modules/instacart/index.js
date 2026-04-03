import { Router } from 'express'
import { body } from 'express-validator'
import { requireAuth } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/errorHandler.js'
import { validate } from '../../middleware/validate.js'

const router = Router()
router.use(requireAuth)

const INSTACART_API_KEY = process.env.INSTACART_API_KEY
const INSTACART_BASE = 'https://connect.instacart.com'

// ---------------------------------------------------------------------------
// POST /api/instacart/shopping-link
// Builds an Instacart shopping list page from the user's grocery items.
// Accepts { items, title } where items is the merged grocery list.
// Returns { url } — null if INSTACART_API_KEY is not configured (stub mode).
// ---------------------------------------------------------------------------
router.post(
  '/shopping-link',
  [
    body('items').isArray({ min: 1 }),
    body('title').optional().isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { items, title = 'My Grocery List' } = req.body

    if (!INSTACART_API_KEY) {
      // Stub mode — API key not yet configured
      return res.json({ url: null, stub: true })
    }

    // Map Feast grocery items to Instacart line_items format
    const line_items = items.map((item) => {
      const lineItem = {
        name: item.display_name,
        display_text: item.display_name,
      }
      if (item.quantity != null || item.unit != null) {
        lineItem.line_item_measurements = [{
          quantity: item.quantity ?? 1,
          unit: item.unit ?? 'each',
        }]
      }
      return lineItem
    })

    const payload = {
      title,
      link_type: 'shopping_list',
      expires_in: 30,
      partner_linkback_url: process.env.APP_URL ?? null,
      line_items,
    }

    const response = await fetch(`${INSTACART_BASE}/idp/v1/products/products_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INSTACART_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(502).json({ error: 'Instacart API error', detail: err })
    }

    const data = await response.json()
    res.json({ url: data.products_link_url })
  })
)

export default router
