CREATE TABLE media_assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES users(id),
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('recipe','profile','cookbook')),
  entity_id      UUID NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('image','video')),
  storage_key    TEXT NOT NULL,
  url            TEXT NOT NULL,
  thumbnail_url  TEXT,
  mime_type      TEXT,
  size_bytes     BIGINT,
  width          INT,
  height         INT,
  duration_secs  INT,
  display_order  INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Wire the cover_media_id FK now that media_assets exists
ALTER TABLE recipes
  ADD CONSTRAINT fk_recipes_cover_media
  FOREIGN KEY (cover_media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX idx_media_entity ON media_assets(entity_type, entity_id);
