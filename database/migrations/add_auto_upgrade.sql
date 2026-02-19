-- Migration: Add auto-upgrade system for subscription limits
-- Date: 2026-02-12

-- Add upgrade_plan_id to subscription_plans (which plan to upgrade to when limit reached)
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS upgrade_plan_id UUID REFERENCES subscription_plans(id);

-- Add auto-upgrade settings to user_subscriptions
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS allow_auto_upgrade BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_upgrade_plan_id UUID REFERENCES subscription_plans(id);

-- Create usage_alerts table to track sent alerts (prevent duplicate notifications)
CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  alert_type VARCHAR(20) NOT NULL, -- '80_percent', '100_percent', 'auto_upgrade'
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, alert_type, period_year, period_month)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_usage_alerts_user_period 
ON usage_alerts(user_id, period_year, period_month);

-- Comment on columns
COMMENT ON COLUMN subscription_plans.upgrade_plan_id IS 'The plan to upgrade to when user reaches limit (null = no auto-upgrade available)';
COMMENT ON COLUMN user_subscriptions.allow_auto_upgrade IS 'Whether user wants automatic upgrade when reaching limit';
COMMENT ON COLUMN user_subscriptions.auto_upgrade_plan_id IS 'Override plan to upgrade to (null = use plan default)';
COMMENT ON TABLE usage_alerts IS 'Tracks usage alerts sent to users to prevent duplicate notifications';
