-- Add waha_credit_requirement to subscription_plans
-- Controls free plan WAHA access based on user credit status:
--   'none'         - WAHA creation not allowed (default)
--   'no_credit'    - WAHA allowed with no credit required
--   'after_credit' - WAHA allowed only after user has registered a payment method at least once
--   'while_credit' - WAHA allowed only while user has an active payment method; disconnect if removed

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS waha_credit_requirement VARCHAR(20) DEFAULT 'none'
    CHECK (waha_credit_requirement IN ('none', 'no_credit', 'after_credit', 'while_credit'));

-- Migrate existing allow_waha_creation = true rows to 'no_credit' (backward compatible)
UPDATE subscription_plans
SET waha_credit_requirement = 'no_credit'
WHERE allow_waha_creation = true AND waha_credit_requirement = 'none';
