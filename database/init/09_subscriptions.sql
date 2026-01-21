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
    
    status VARCHAR(20) DEFAULT 'active', -- active, cancelled, expired, pending
    
    -- Billing info
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Payment reference (for future payment integration)
    payment_reference VARCHAR(255),
    
    -- Manual override by admin
    is_manual BOOLEAN DEFAULT false,
    admin_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id) -- One subscription per user
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

-- Insert default plans
INSERT INTO subscription_plans (id, name, name_he, description_he, price, max_bots, max_bot_runs_per_month, max_contacts, allow_statistics, allow_waha_creation, allow_export, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Free', 'חינם', 'תכנית חינמית עם יכולות בסיסיות', 0, 1, 500, 100, false, false, false, 1),
    ('00000000-0000-0000-0000-000000000002', 'Basic', 'בסיסי', 'תכנית בסיסית למשתמשים קטנים', 49, 3, 2000, 500, true, false, true, 2),
    ('00000000-0000-0000-0000-000000000003', 'Pro', 'מקצועי', 'תכנית מקצועית עם כל היכולות', 149, 10, 10000, 2000, true, true, true, 3),
    ('00000000-0000-0000-0000-000000000004', 'Enterprise', 'ארגוני', 'תכנית ללא הגבלות', 499, -1, -1, -1, true, true, true, 4)
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking(user_id, period_year, period_month);
