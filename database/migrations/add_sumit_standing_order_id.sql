-- Add sumit_standing_order_id column to user_subscriptions table
-- This stores the Sumit recurring payment (standing order) ID

ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS sumit_standing_order_id TEXT;

-- Comment
COMMENT ON COLUMN user_subscriptions.sumit_standing_order_id IS 'Sumit recurring payment / standing order ID';
