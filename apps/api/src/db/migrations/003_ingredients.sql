CREATE TABLE ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT UNIQUE NOT NULL,
  category       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ingredient_aliases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias          TEXT NOT NULL,
  locale         TEXT DEFAULT 'en-US',
  UNIQUE(alias, locale)
);

CREATE INDEX idx_ingredients_name_trgm ON ingredients USING GIN(canonical_name gin_trgm_ops);
CREATE INDEX idx_ingredient_aliases_alias ON ingredient_aliases(lower(alias));
