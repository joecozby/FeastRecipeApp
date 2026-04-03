-- Add is_manual flag so hand-typed items survive recipe-triggered rebuilds
ALTER TABLE grocery_list_items
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;
