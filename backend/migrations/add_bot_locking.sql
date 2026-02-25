-- Add bot locking mechanism
-- locked_reason = NULL means bot is not locked
-- locked_reason = 'subscription_limit' means user downgraded and this bot exceeds limit
-- locked_at = when the bot was locked

ALTER TABLE bots ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(100) DEFAULT NULL;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP DEFAULT NULL;

-- Create index for faster locked bot queries
CREATE INDEX IF NOT EXISTS idx_bots_locked ON bots(user_id, locked_reason) WHERE locked_reason IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN bots.locked_reason IS 'NULL = not locked, subscription_limit = exceeds plan limit, admin = locked by admin';
COMMENT ON COLUMN bots.locked_at IS 'Timestamp when bot was locked';
