-- Each grocery list item now tracks which recipe it came from,
-- and carries an ingredient_key for fast cross-recipe grouping.

ALTER TABLE grocery_list_items
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE;

ALTER TABLE grocery_list_items
  ADD COLUMN IF NOT EXISTS ingredient_key TEXT;

-- Index for the bulk-check-by-ingredient endpoint
CREATE INDEX IF NOT EXISTS idx_grocery_items_ingredient_key
  ON grocery_list_items (grocery_list_id, ingredient_key);
