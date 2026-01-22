-- Promotions table for special offers
-- Example: 3 months at 50 ILS, then 99 ILS/month

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  name_he VARCHAR(255),
  description TEXT,
  description_he TEXT,
  
  -- Which plan this promotion applies to
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
  
  -- Promotion pricing
  promo_price DECIMAL(10,2) NOT NULL,           -- Price during promo period (per month)
  promo_months INTEGER NOT NULL DEFAULT 3,       -- How many months at promo price
  regular_price DECIMAL(10,2),                   -- Price after promo (NULL = use plan's regular price)
  
  -- Billing
  billing_period VARCHAR(20) DEFAULT 'monthly',  -- 'monthly' or 'yearly'
  
  -- Targeting
  is_new_users_only BOOLEAN DEFAULT true,        -- Only for first-time paying users
  is_active BOOLEAN DEFAULT true,
  
  -- Validity period
  start_date TIMESTAMPTZ,                        -- NULL = immediately
  end_date TIMESTAMPTZ,                          -- NULL = no end date
  
  -- Coupon code (optional)
  coupon_code VARCHAR(50) UNIQUE,                -- e.g., 'WELCOME50'
  max_uses INTEGER,                              -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which users used which promotions
CREATE TABLE IF NOT EXISTS user_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'active',           -- 'active', 'completed', 'cancelled'
  
  -- Tracking
  promo_start_date TIMESTAMPTZ DEFAULT NOW(),
  promo_end_date TIMESTAMPTZ,                    -- When promo period ends (auto-calculated)
  months_remaining INTEGER,                      -- How many promo months left
  
  -- Price info (snapshot at time of use)
  promo_price_used DECIMAL(10,2),
  regular_price_after DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, promotion_id)
);

-- Add is_first_payment flag to users to easily identify new paying users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_ever_paid BOOLEAN DEFAULT false;

-- Add promotion tracking to user_subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS active_promotion_id UUID REFERENCES promotions(id),
ADD COLUMN IF NOT EXISTS promo_months_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS promo_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS regular_price_after_promo DECIMAL(10,2);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_coupon ON promotions(coupon_code) WHERE coupon_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_promotions_user ON user_promotions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_promotions_status ON user_promotions(status);

-- Comments
COMMENT ON TABLE promotions IS 'Special promotional offers with introductory pricing';
COMMENT ON COLUMN promotions.promo_months IS 'Number of months the promotional price applies';
COMMENT ON COLUMN promotions.is_new_users_only IS 'If true, only available to users who never paid before';
COMMENT ON TABLE user_promotions IS 'Tracks which users have used which promotions';
