CREATE TABLE grocery_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE grocery_list_recipes (
  grocery_list_id  UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  servings         NUMERIC(6,2),
  added_at         TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (grocery_list_id, recipe_id)
);

CREATE TABLE grocery_list_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id   UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  ingredient_id     UUID REFERENCES ingredients(id),
  display_name      TEXT NOT NULL,
  quantity          NUMERIC(10,4),
  unit              TEXT,
  is_checked        BOOLEAN DEFAULT false,
  notes             TEXT,
  display_order     INT DEFAULT 0,
  source_recipe_ids JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_grocery_items_list ON grocery_list_items(grocery_list_id);
