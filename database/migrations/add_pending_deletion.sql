-- Add pending_deletion column to bots table
-- This is used when a user's subscription expires and they need to choose which bot to keep

ALTER TABLE bots 
ADD COLUMN IF NOT EXISTS pending_deletion BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bots_pending_deletion ON bots(user_id, pending_deletion) WHERE pending_deletion = true;

-- Comment for documentation
COMMENT ON COLUMN bots.pending_deletion IS 'True when subscription expired and user must select one bot to keep. Others will be deleted.';
