CREATE TABLE product_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  retailer        TEXT NOT NULL,
  retailer_sku    TEXT,
  retailer_name   TEXT,
  retailer_url    TEXT,
  preferred_unit  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ingredient_id, retailer)
);
