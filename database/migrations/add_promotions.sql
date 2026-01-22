-- =====================================================
-- PROMOTIONS & REFERRAL SYSTEM
-- =====================================================

-- Promotions table for special offers
-- Example: 3 months at 50% off, then regular price
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Display name (Hebrew only, no English required)
  name VARCHAR(255) NOT NULL,               -- Hebrew display name
  description TEXT,
  
  -- Which plan this promotion applies to (NULL = all plans)
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
  
  -- Discount type: 'fixed' (ש"ח) or 'percentage' (%)
  discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',  -- 'fixed' or 'percentage'
  discount_value DECIMAL(10,2) NOT NULL,               -- Amount in ILS or percentage (0-100)
  
  -- How many months the discount applies
  promo_months INTEGER NOT NULL DEFAULT 3,
  
  -- Price after promo (NULL = use plan's regular price)
  price_after_promo DECIMAL(10,2),
  price_after_discount_type VARCHAR(20),    -- 'fixed' or 'percentage' for price after promo
  price_after_discount_value DECIMAL(10,2), -- Discount for price after promo period
  
  -- Targeting
  is_new_users_only BOOLEAN DEFAULT true,   -- Only for first-time paying users
  is_active BOOLEAN DEFAULT true,
  
  -- Validity period
  start_date TIMESTAMPTZ,                   -- NULL = immediately
  end_date TIMESTAMPTZ,                     -- NULL = no end date
  
  -- Coupon code (optional)
  coupon_code VARCHAR(50) UNIQUE,           -- e.g., 'WELCOME50'
  max_uses INTEGER,                         -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  
  -- Coupon owner (for tracking who referred)
  coupon_owner_id UUID REFERENCES users(id), -- User who owns this coupon code
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which users used which promotions (and who referred them)
CREATE TABLE IF NOT EXISTS user_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id),
  
  -- Who referred this user (coupon owner)
  referred_by_user_id UUID REFERENCES users(id),
  coupon_code_used VARCHAR(50),
  
  -- Status
  status VARCHAR(20) DEFAULT 'active',      -- 'active', 'completed', 'cancelled'
  
  -- Tracking
  promo_start_date TIMESTAMPTZ DEFAULT NOW(),
  promo_end_date TIMESTAMPTZ,
  months_remaining INTEGER,
  
  -- Price info (snapshot at time of use)
  original_price DECIMAL(10,2),
  discount_applied DECIMAL(10,2),
  final_price DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, promotion_id)
);

-- =====================================================
-- REFERRAL / AFFILIATE SYSTEM
-- =====================================================

-- Referral settings (system-wide configuration)
CREATE TABLE IF NOT EXISTS referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Credit per referral
  credit_per_referral DECIMAL(10,2) DEFAULT 20.00,  -- ILS per successful referral
  
  -- What counts as a successful referral
  referral_trigger VARCHAR(50) DEFAULT 'subscription',  -- 'email_verified' or 'subscription'
  
  -- Minimum credit to redeem
  min_credit_to_redeem DECIMAL(10,2) DEFAULT 100.00,
  
  -- What can be redeemed
  redeem_type VARCHAR(50) DEFAULT 'month_free',  -- 'month_free' or 'discount'
  redeem_value DECIMAL(10,2) DEFAULT 1,          -- 1 month free, or discount amount
  
  -- Is referral program active
  is_active BOOLEAN DEFAULT true,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO referral_settings (id, credit_per_referral, referral_trigger, min_credit_to_redeem, redeem_type, redeem_value, is_active)
VALUES (gen_random_uuid(), 20.00, 'subscription', 100.00, 'month_free', 1, true)
ON CONFLICT DO NOTHING;

-- User referral data
CREATE TABLE IF NOT EXISTS user_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Unique referral code for this user
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  
  -- Credit balance
  credit_balance DECIMAL(10,2) DEFAULT 0.00,
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  total_redeemed DECIMAL(10,2) DEFAULT 0.00,
  
  -- Stats
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,  -- Based on referral_trigger
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track individual referrals
CREATE TABLE IF NOT EXISTS referral_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who referred
  referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Who was referred
  referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Referral code used
  referral_code VARCHAR(20) NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'completed', 'credited'
  
  -- Credit info
  credit_amount DECIMAL(10,2),
  credited_at TIMESTAMPTZ,
  
  -- What triggered completion
  trigger_type VARCHAR(50),  -- 'email_verified' or 'subscription'
  trigger_date TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(referrer_id, referred_user_id)
);

-- Track redemptions
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- What was redeemed
  redeem_type VARCHAR(50) NOT NULL,  -- 'month_free', 'discount'
  credit_used DECIMAL(10,2) NOT NULL,
  
  -- Applied to subscription
  subscription_id UUID REFERENCES user_subscriptions(id),
  
  -- Details
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER TABLE UPDATES
-- =====================================================

-- Add referral and payment tracking to users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_ever_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20);

-- Add promotion tracking to user_subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS active_promotion_id UUID REFERENCES promotions(id),
ADD COLUMN IF NOT EXISTS promo_months_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS promo_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS regular_price_after_promo DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS referral_month_free_until TIMESTAMPTZ;  -- If they got free month from referral

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_coupon ON promotions(coupon_code) WHERE coupon_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_owner ON promotions(coupon_owner_id) WHERE coupon_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_promotions_user ON user_promotions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_promotions_referred ON user_promotions(referred_by_user_id);
CREATE INDEX IF NOT EXISTS idx_user_promotions_status ON user_promotions(status);

CREATE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_history_referrer ON referral_history(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_history_referred ON referral_history(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_history_status ON referral_history(status);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE promotions IS 'Special promotional offers with discounts (fixed or percentage)';
COMMENT ON COLUMN promotions.discount_type IS 'Type of discount: fixed (ILS) or percentage (%)';
COMMENT ON COLUMN promotions.coupon_owner_id IS 'User who owns this coupon - gets credit when someone uses it';

COMMENT ON TABLE user_referrals IS 'Stores each user''s referral code and credit balance';
COMMENT ON TABLE referral_history IS 'Tracks who referred whom and credit status';
COMMENT ON TABLE referral_settings IS 'System-wide referral program settings';
