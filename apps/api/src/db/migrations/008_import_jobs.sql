CREATE TABLE import_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  source_type    TEXT NOT NULL
                   CHECK (source_type IN ('url','instagram','text','manual')),
  source_input   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','done','failed')),
  recipe_id      UUID REFERENCES recipes(id),
  error_message  TEXT,
  ai_response    JSONB,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_jobs_user   ON import_jobs(user_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
