CREATE TABLE spice_cabinet_master (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_spice_cabinet (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  master_id   INTEGER NOT NULL REFERENCES spice_cabinet_master(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, master_id)
);

CREATE INDEX idx_user_spice_cabinet_user ON user_spice_cabinet(user_id);
CREATE INDEX idx_spice_cabinet_master_category ON spice_cabinet_master(category, sort_order);
