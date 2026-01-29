-- Preserve forward jobs when forward is deleted
-- Migration: preserve_forward_jobs_on_delete.sql

-- 1. Add forward_name column to store the name permanently
ALTER TABLE forward_jobs 
ADD COLUMN IF NOT EXISTS forward_name VARCHAR(255);

-- 2. Populate forward_name from existing forwards
UPDATE forward_jobs fj
SET forward_name = gf.name
FROM group_forwards gf
WHERE fj.forward_id = gf.id AND fj.forward_name IS NULL;

-- 3. Drop the old foreign key constraint
ALTER TABLE forward_jobs 
DROP CONSTRAINT IF EXISTS forward_jobs_forward_id_fkey;

-- 4. Make forward_id nullable
ALTER TABLE forward_jobs 
ALTER COLUMN forward_id DROP NOT NULL;

-- 5. Add new foreign key with SET NULL instead of CASCADE
ALTER TABLE forward_jobs
ADD CONSTRAINT forward_jobs_forward_id_fkey 
FOREIGN KEY (forward_id) REFERENCES group_forwards(id) ON DELETE SET NULL;

-- 6. Also fix forward_job_messages - change CASCADE to SET NULL for target_id
ALTER TABLE forward_job_messages
DROP CONSTRAINT IF EXISTS forward_job_messages_target_id_fkey;

ALTER TABLE forward_job_messages
ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE forward_job_messages
ADD CONSTRAINT forward_job_messages_target_id_fkey 
FOREIGN KEY (target_id) REFERENCES group_forward_targets(id) ON DELETE SET NULL;

SELECT 'Forward jobs will now be preserved when forwards are deleted!' as status;
