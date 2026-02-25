-- Billing Queue Table - Self-managed recurring billing
CREATE TABLE IF NOT EXISTS billing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    
    -- Charge details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    charge_date DATE NOT NULL,
    
    -- Status: pending, processing, completed, failed, cancelled
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Type: monthly, yearly, manual, reactivation, trial_conversion
    billing_type VARCHAR(30) NOT NULL,
    
    -- Retry handling
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    last_error TEXT,
    last_error_code VARCHAR(50),
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_retry_at DATE,
    
    -- Reference to related records
    plan_id UUID REFERENCES subscription_plans(id),
    description TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_billing_queue_status ON billing_queue(status);
CREATE INDEX IF NOT EXISTS idx_billing_queue_charge_date ON billing_queue(charge_date);
CREATE INDEX IF NOT EXISTS idx_billing_queue_user ON billing_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_queue_pending ON billing_queue(status, charge_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_billing_queue_failed ON billing_queue(status, next_retry_at) WHERE status = 'failed';

-- Add new columns to payment_history
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS billing_queue_id UUID REFERENCES billing_queue(id) ON DELETE SET NULL;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS failure_code VARCHAR(50);
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES payment_history(id) ON DELETE SET NULL;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS billing_type VARCHAR(30);
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100);

-- Index for billing queue lookups
CREATE INDEX IF NOT EXISTS idx_payment_history_billing_queue ON payment_history(billing_queue_id);

-- Admin audit log for billing actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at);
