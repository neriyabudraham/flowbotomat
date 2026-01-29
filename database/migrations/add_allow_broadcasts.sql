-- Add allow_broadcasts column to subscription_plans
-- Migration: add_allow_broadcasts.sql

-- Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscription_plans' AND column_name = 'allow_broadcasts'
    ) THEN
        ALTER TABLE subscription_plans ADD COLUMN allow_broadcasts BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Enable broadcasts for Pro and Enterprise plans (assuming these are the paid plans)
UPDATE subscription_plans 
SET allow_broadcasts = TRUE 
WHERE name IN ('Pro', 'Enterprise');

-- Disable for Free and Basic plans
UPDATE subscription_plans 
SET allow_broadcasts = FALSE 
WHERE name IN ('Free', 'Basic');

SELECT 'allow_broadcasts column added!' as status;
