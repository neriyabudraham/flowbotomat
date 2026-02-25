-- Add updated_at column to status_bot_statuses if not exists
ALTER TABLE status_bot_statuses 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add unique index on queue_id for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_status_bot_statuses_queue_id_unique 
ON status_bot_statuses(queue_id) WHERE queue_id IS NOT NULL;
