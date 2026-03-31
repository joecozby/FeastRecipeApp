CREATE TABLE nutrition_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    UUID UNIQUE NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  per_serving  JSONB NOT NULL,
  computed_at  TIMESTAMPTZ DEFAULT now(),
  is_estimated BOOLEAN DEFAULT true
);
