-- Add username column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- Backfill existing users: derive username from the local part of their email,
-- lowercased and stripped of any non-alphanumeric/underscore characters.
UPDATE users
SET username = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
WHERE username IS NULL;

-- Safety: if cleanup produced an empty string, fall back to a unique stub
UPDATE users
SET username = 'user_' || left(id::text, 8)
WHERE username IS NULL OR username = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Case-insensitive uniqueness enforced at the index level
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users(lower(username));
