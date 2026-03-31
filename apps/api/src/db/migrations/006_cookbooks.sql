CREATE TABLE cookbooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE cookbook_recipes (
  cookbook_id    UUID NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  recipe_id      UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  display_order  INT DEFAULT 0,
  added_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (cookbook_id, recipe_id)
);

CREATE INDEX idx_cookbooks_owner ON cookbooks(owner_id);
