-- Add user-controlled display order to cookbooks
ALTER TABLE cookbooks ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Seed existing cookbooks with sequential order per owner based on created_at
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at) - 1 AS rn
  FROM cookbooks
)
UPDATE cookbooks SET display_order = ordered.rn
FROM ordered WHERE cookbooks.id = ordered.id;
