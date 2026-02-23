-- Fix bot_trigger_history table to use TEXT instead of BIGINT for trigger_group_id
-- This is needed because trigger_group_id is a string like "group_1" from the frontend

-- First create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS bot_trigger_history (
  id BIGSERIAL PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  trigger_group_id TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_trigger_history_bot_contact ON bot_trigger_history(bot_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_bot_trigger_history_group ON bot_trigger_history(trigger_group_id);

-- If table exists with BIGINT column, alter it to TEXT
DO $$
BEGIN
  -- Check if column is BIGINT and alter it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bot_trigger_history' 
    AND column_name = 'trigger_group_id' 
    AND data_type = 'bigint'
  ) THEN
    ALTER TABLE bot_trigger_history ALTER COLUMN trigger_group_id TYPE TEXT;
    RAISE NOTICE 'Column trigger_group_id changed from BIGINT to TEXT';
  END IF;
END $$;

SELECT 'bot_trigger_history table fixed!' as status;
