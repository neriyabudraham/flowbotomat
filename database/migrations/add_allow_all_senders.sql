-- Add allow_all_senders column to group_forwards
-- When true (default): anyone can send, senders list is for capabilities only
-- When false: only listed senders can trigger the forward
ALTER TABLE group_forwards ADD COLUMN IF NOT EXISTS allow_all_senders BOOLEAN DEFAULT true;
