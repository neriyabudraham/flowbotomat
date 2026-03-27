-- Add trigger_conflict_mode to group_forwards
-- Controls what happens when a message matches both a bot trigger and a forward trigger
-- 'both' = both run (default), 'forward_only' = only forward runs, 'bot_only' = only bot runs
ALTER TABLE group_forwards ADD COLUMN IF NOT EXISTS trigger_conflict_mode VARCHAR(20) DEFAULT 'both';
