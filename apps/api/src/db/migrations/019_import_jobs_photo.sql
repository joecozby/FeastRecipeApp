-- Add 'photo' to the source_type CHECK constraint on import_jobs.
-- The table was created before photo import was supported.
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_type_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_source_type_check
  CHECK (source_type IN ('url', 'instagram', 'text', 'manual', 'photo'));
