import pool from '../config/db.js'

// ---------------------------------------------------------------------------
// Strip preparation text that may have leaked into a canonical name.
// e.g. "bell peppers into strips" → "bell peppers"
//      "onion thinly sliced"      → "onion"
// This is a safety net for ingredients imported before PREP_TERMS was complete.
// ---------------------------------------------------------------------------
const PREP_LEAK_RE = /\s*,?\s*(?:cut\s+into\b|into\s+(?:strips?|pieces?|cubes?|chunks?|rings?|wedges?|florets?|matchsticks?)\b|cut\s+up\b|cut\s+in\s+half\b|thinly\b|finely\b|roughly\b|coarsely\b|freshly\b|lightly\b|peeled\b|sliced\b|chopped\b|diced\b|minced\b|grated\b|shredded\b|crushed\b|halved\b|quartered\b|cubed\b|trimmed\b|torn\b|blanched\b|roasted\b|toasted\b|softened\b|melted\b|drained\b|rinsed\b|deveined\b).*/i

function cleanDisplayName(name) {
  if (!name) return name
  const cleaned = name.replace(PREP_LEAK_RE, '').replace(/,\s*$/, '').trim()
  return cleaned || name
}

// ---------------------------------------------------------------------------
// Build a stable ingredient_key for grouping across recipes
// ---------------------------------------------------------------------------

export function makeIngredientKey(ingredientId, unit, rawText) {
  if (ingredientId) return `id:${ingredientId}:${unit ?? ''}`
  return `raw:${(rawText || '').toLowerCase().trim()}`
}

// ---------------------------------------------------------------------------
// Get or create the user's single grocery list, returning its id
// ---------------------------------------------------------------------------

export async function getOrCreateList(userId) {
  const { rows: [existing] } = await pool.query(
    `SELECT id FROM grocery_lists WHERE user_id = $1`,
    [userId]
  )
  if (existing) return existing.id

  const { rows: [created] } = await pool.query(
    `INSERT INTO grocery_lists (user_id) VALUES ($1) RETURNING id`,
    [userId]
  )
  return created.id
}

// ---------------------------------------------------------------------------
// Rebuild grocery items for a list — must be called inside a transaction.
// Stores one row per (recipe × ingredient); the frontend merges for display.
// Preserves is_checked state by ingredient_key across rebuilds.
// ---------------------------------------------------------------------------

export async function rebuildGroceryItems(groceryListId, client) {
  // 1. Load all recipes currently in the list
  const { rows: listRecipes } = await client.query(
    `SELECT glr.recipe_id, glr.servings AS chosen_servings, r.base_servings
     FROM grocery_list_recipes glr
     JOIN recipes r ON r.id = glr.recipe_id
     WHERE glr.grocery_list_id = $1 AND r.deleted_at IS NULL`,
    [groceryListId]
  )

  // 2. Snapshot checked-by-ingredient_key before wiping items
  const { rows: existingItems } = await client.query(
    `SELECT ingredient_key, is_checked
     FROM grocery_list_items WHERE grocery_list_id = $1`,
    [groceryListId]
  )
  const checkedByKey = new Map()
  for (const item of existingItems) {
    if (item.ingredient_key && item.is_checked) {
      checkedByKey.set(item.ingredient_key, true)
    }
  }

  // 3. Delete only recipe-sourced items (preserve is_manual rows)
  await client.query(
    `DELETE FROM grocery_list_items WHERE grocery_list_id = $1 AND is_manual = FALSE`,
    [groceryListId]
  )

  // 4. Insert one row per (recipe × ingredient), scaled to chosen servings
  let order = 0
  for (const lr of listRecipes) {
    const scale = lr.base_servings
      ? (lr.chosen_servings ?? lr.base_servings) / lr.base_servings
      : 1

    const { rows: ings } = await client.query(
      `SELECT ri.ingredient_id, ri.raw_text, ri.quantity, ri.unit,
              ri.display_order, i.canonical_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.display_order`,
      [lr.recipe_id]
    )

    for (const ing of ings) {
      const scaledQty = ing.quantity != null
        ? Math.round(parseFloat(ing.quantity) * scale * 10000) / 10000
        : null
      const displayName = cleanDisplayName(ing.canonical_name || ing.raw_text)
      const ingredientKey = makeIngredientKey(ing.ingredient_id, ing.unit, ing.raw_text)
      const isChecked = checkedByKey.get(ingredientKey) ?? false

      await client.query(
        `INSERT INTO grocery_list_items
           (grocery_list_id, recipe_id, ingredient_id, display_name,
            quantity, unit, is_checked, ingredient_key, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          groceryListId,
          lr.recipe_id,
          ing.ingredient_id ?? null,
          displayName,
          scaledQty,
          ing.unit ?? null,
          isChecked,
          ingredientKey,
          order++,
        ]
      )
    }
  }

  await client.query(
    `UPDATE grocery_lists SET updated_at = now() WHERE id = $1`,
    [groceryListId]
  )
}
