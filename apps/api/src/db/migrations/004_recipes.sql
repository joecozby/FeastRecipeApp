CREATE TABLE recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  source_url       TEXT,
  raw_import_data  JSONB,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published')),
  base_servings    NUMERIC(6,2),
  cuisine          TEXT,
  difficulty       TEXT CHECK (difficulty IN ('easy','medium','hard')),
  prep_time_mins   INT,
  cook_time_mins   INT,
  cover_media_id   UUID,
  fts_vector       TSVECTOR,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE TABLE instructions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number  INT NOT NULL,
  body         TEXT NOT NULL,
  group_label  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, step_number)
);

CREATE TABLE recipe_ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id  UUID REFERENCES ingredients(id),
  raw_text       TEXT NOT NULL,
  quantity       NUMERIC(10,4),
  unit           TEXT,
  preparation    TEXT,
  notes          TEXT,
  is_optional    BOOLEAN DEFAULT false,
  display_order  INT NOT NULL DEFAULT 0,
  group_label    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION recipes_fts_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.cuisine, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipes_fts
  BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION recipes_fts_update();

CREATE INDEX idx_recipes_owner         ON recipes(owner_id);
CREATE INDEX idx_recipes_status        ON recipes(status);
CREATE INDEX idx_recipes_deleted       ON recipes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_recipes_fts           ON recipes USING GIN(fts_vector);
CREATE INDEX idx_recipes_title_trgm    ON recipes USING GIN(title gin_trgm_ops);
CREATE INDEX idx_recipe_ingredients_recipe     ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
