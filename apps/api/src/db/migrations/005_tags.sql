CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  type       TEXT NOT NULL DEFAULT 'user'
               CHECK (type IN ('user','system')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recipe_tags (
  recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX idx_tags_name_trgm ON tags USING GIN(name gin_trgm_ops);
