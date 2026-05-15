-- Allow multiple insurance profiles per user
-- Drop the unique constraint so a user can have multiple rows (self, spouse, child, etc.)
ALTER TABLE health_profiles DROP CONSTRAINT IF EXISTS health_profiles_user_id_key;

-- Add label and relationship columns
ALTER TABLE health_profiles ADD COLUMN IF NOT EXISTS profile_label text DEFAULT 'Mine';
ALTER TABLE health_profiles ADD COLUMN IF NOT EXISTS relationship text DEFAULT 'self';
-- relationship values: 'self' | 'spouse' | 'child' | 'parent' | 'other'

-- Create a non-unique index on user_id (was implicit from unique constraint)
CREATE INDEX IF NOT EXISTS health_profiles_user_id_idx ON health_profiles(user_id);

-- Add PATCH/DELETE support (policies already exist via row-level security)
