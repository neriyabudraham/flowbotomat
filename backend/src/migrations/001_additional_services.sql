-- Additional Services Tables
-- Run this migration to add the additional_services feature

-- שירותים/מוצרים נוספים
CREATE TABLE IF NOT EXISTS additional_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL, -- 'webhook-engine', 'forms', etc.
  name VARCHAR(100) NOT NULL,
  name_he VARCHAR(100) NOT NULL,
  description TEXT,
  description_he TEXT,
  
  -- Pricing
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  yearly_price DECIMAL(10,2), -- null = price * 10 (20% off)
  billing_period VARCHAR(20) DEFAULT 'monthly',
  
  -- Trial settings (DEFAULT: no trial)
  trial_days INTEGER DEFAULT 0, -- 0 = no trial by default
  allow_custom_trial BOOLEAN DEFAULT true, -- allow admin to set per-user
  
  -- Display
  icon VARCHAR(50),
  color VARCHAR(100), -- gradient class or color
  external_url VARCHAR(255), -- 'https://webhook-engine.botomat.co.il'
  
  -- Features/limits as JSON for flexibility
  features JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_coming_soon BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- מנויי שירותים לכל משתמש
CREATE TABLE IF NOT EXISTS user_service_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, trial, cancelled, expired
  is_trial BOOLEAN DEFAULT false,
  trial_ends_at TIMESTAMP,
  
  -- Dates
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  next_charge_date TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Sumit integration (separate standing order per service)
  sumit_standing_order_id VARCHAR(100),
  
  -- Billing info
  billing_period VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly
  custom_price DECIMAL(10,2), -- null = use service default
  
  -- Admin management
  admin_notes TEXT,
  is_manual BOOLEAN DEFAULT false, -- manually assigned by admin
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, service_id)
);

-- היסטוריית תשלומים לשירותים
CREATE TABLE IF NOT EXISTS service_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_service_subscriptions(id) ON DELETE SET NULL,
  
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL, -- success, failed, refunded
  payment_type VARCHAR(20) DEFAULT 'recurring', -- recurring, one_time, upgrade
  
  sumit_transaction_id VARCHAR(100),
  sumit_document_number VARCHAR(50),
  description TEXT,
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- שימוש בשירותים (flexible per service)
CREATE TABLE IF NOT EXISTS service_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
  
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  
  -- Flexible usage data per service type
  usage_data JSONB DEFAULT '{}',
  -- Example for webhook-engine: {"webhooks_created": 5, "requests_received": 1234}
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, service_id, period_year, period_month)
);

-- הגדרות Trial מותאמות לכל משתמש (admin override)
CREATE TABLE IF NOT EXISTS user_service_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
  
  custom_trial_days INTEGER NOT NULL, -- override for this specific user
  reason TEXT, -- why admin gave this trial
  granted_by UUID REFERENCES users(id), -- admin who granted
  granted_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, service_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_service_subs_user ON user_service_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_service_subs_service ON user_service_subscriptions(service_id);
CREATE INDEX IF NOT EXISTS idx_user_service_subs_status ON user_service_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_service_payment_history_user ON service_payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_service_usage_user_service ON service_usage(user_id, service_id);
CREATE INDEX IF NOT EXISTS idx_additional_services_slug ON additional_services(slug);
CREATE INDEX IF NOT EXISTS idx_additional_services_active ON additional_services(is_active) WHERE is_active = true;
