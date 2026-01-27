-- User feature overrides
-- Allows admin to customize feature limits per user, overriding their subscription plan defaults

-- Add feature_overrides column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_overrides JSONB DEFAULT NULL;

-- The feature_overrides column stores a JSON object with any of these keys:
-- {
--   "max_bots": number,
--   "max_bot_runs_per_month": number,
--   "max_contacts": number,
--   "allow_statistics": boolean,
--   "allow_waha_creation": boolean,
--   "allow_export": boolean,
--   "allow_api_access": boolean,
--   "priority_support": boolean,
--   "allow_group_forwards": boolean,
--   "max_group_forwards": number,
--   "max_forward_targets": number,
--   "max_livechats": number,
--   "allow_livechat": boolean
-- }
-- When NULL, user gets features from their subscription plan
-- When set, these values override the plan defaults

COMMENT ON COLUMN users.feature_overrides IS 'Custom feature limits that override subscription plan defaults. NULL means use plan defaults.';
