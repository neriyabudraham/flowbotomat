-- Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    name_he VARCHAR(100) NOT NULL,
    description TEXT,
    description_he TEXT,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'ILS',
    billing_period VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly, one_time
    
    -- Trial period
    trial_days INTEGER DEFAULT 0,
    
    -- Feature limits
    max_bots INTEGER DEFAULT 1,
    max_bot_runs_per_month INTEGER DEFAULT 500,
    max_contacts INTEGER DEFAULT 100,
    allow_statistics BOOLEAN DEFAULT false,
    allow_waha_creation BOOLEAN DEFAULT false,
    allow_export BOOLEAN DEFAULT false,
    allow_api_access BOOLEAN DEFAULT false,
    priority_support BOOLEAN DEFAULT false,
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Subscriptions Table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    
    status VARCHAR(20) DEFAULT 'active', -- active, cancelled, expired, pending, trial
    
    -- Trial info
    is_trial BOOLEAN DEFAULT false,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    
    -- Billing info
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    next_charge_date TIMESTAMP WITH TIME ZONE,
    
    -- Payment reference
    payment_method_id UUID,
    sumit_customer_id VARCHAR(255),
    
    -- Manual override by admin
    is_manual BOOLEAN DEFAULT false,
    admin_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id) -- One subscription per user
);

-- User Payment Methods (Credit Cards)
CREATE TABLE IF NOT EXISTS user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Card info (tokenized)
    card_token VARCHAR(255) NOT NULL, -- Sumit SingleUseToken
    card_last_digits VARCHAR(4),
    card_expiry_month INTEGER,
    card_expiry_year INTEGER,
    card_holder_name VARCHAR(255),
    
    -- Customer info for billing
    citizen_id VARCHAR(20), -- תעודת זהות
    sumit_customer_id INTEGER, -- מזהה לקוח ב-Sumit
    
    -- Metadata
    is_default BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment History
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    payment_method_id UUID REFERENCES user_payment_methods(id) ON DELETE SET NULL,
    
    -- Payment info
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed, refunded
    
    -- Sumit reference
    sumit_transaction_id VARCHAR(255),
    sumit_document_number VARCHAR(100),
    
    -- Error info
    error_message TEXT,
    
    -- Metadata
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Tracking Table (monthly)
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Period
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    
    -- Counters
    bot_runs INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, period_year, period_month)
);

-- Add has_payment_method column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_payment_method BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking(user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user ON payment_history(user_id);
