-- Social foundation schema — tables exist but NO routes/logic are active in MVP.
-- Do not build endpoints against these tables until the social feature is intentionally enabled.

CREATE TABLE posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  recipe_id   UUID REFERENCES recipes(id),
  body        TEXT,
  status      TEXT DEFAULT 'active'
                CHECK (status IN ('active','hidden','removed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  post_id     UUID REFERENCES posts(id),
  recipe_id   UUID REFERENCES recipes(id),
  parent_id   UUID REFERENCES comments(id),
  body        TEXT NOT NULL,
  status      TEXT DEFAULT 'active'
                CHECK (status IN ('active','hidden','removed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('post','recipe','comment')),
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id)
);

CREATE TABLE follows (
  follower_id   UUID NOT NULL REFERENCES users(id),
  following_id  UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  CHECK (follower_id <> following_id),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  reason       TEXT,
  status       TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending','reviewed','resolved')),
  created_at   TIMESTAMPTZ DEFAULT now()
);
