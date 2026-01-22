-- =====================================================
-- 1. PROMOTIONS (מבצעים אוטומטיים - בלי קופון)
-- =====================================================
-- מבצעים שמופיעים לכולם/למשתמשים חדשים בדף התמחור
-- לדוגמה: חודש ראשון ב-50₪, אח"כ 99₪

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Display
  name VARCHAR(255) NOT NULL,
  description TEXT,
  badge_text VARCHAR(50),              -- טקסט לתג (לדוגמה: "מבצע!")
  
  -- Which plan (NULL = all plans)
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
  
  -- Discount for promo period
  discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',  -- 'fixed' (₪) or 'percentage' (%)
  discount_value DECIMAL(10,2) NOT NULL,
  promo_months INTEGER NOT NULL DEFAULT 1,             -- How many months at promo price
  
  -- Targeting
  is_new_users_only BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  
  -- Validity
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  
  -- Display priority
  priority INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. COUPONS (קודי קופון להזנה)
-- =====================================================
-- קודים שמזינים ומקבלים הנחה

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Code
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255),                   -- שם פנימי לזיהוי
  
  -- Discount
  discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',  -- 'fixed' (₪) or 'percentage' (%)
  discount_value DECIMAL(10,2) NOT NULL,
  
  -- Duration
  duration_type VARCHAR(20) DEFAULT 'once',  -- 'once' (חד פעמי), 'months' (X חודשים), 'forever' (לכל החיים)
  duration_months INTEGER,                   -- Only if duration_type = 'months'
  
  -- Which plan (NULL = all plans)
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE CASCADE,
  
  -- Limits
  max_uses INTEGER,                    -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  max_uses_per_user INTEGER DEFAULT 1,
  
  -- Targeting
  is_new_users_only BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Validity
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  
  -- Who created
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track coupon usage
CREATE TABLE IF NOT EXISTS coupon_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id),
  
  discount_applied DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(coupon_id, user_id)
);

-- =====================================================
-- 3. AFFILIATE PROGRAM (תוכנית שותפים)
-- =====================================================

-- Program settings
CREATE TABLE IF NOT EXISTS affiliate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Commission per paid subscription
  commission_amount DECIMAL(10,2) DEFAULT 20.00,   -- ₪ per subscription
  commission_type VARCHAR(20) DEFAULT 'fixed',      -- 'fixed' or 'percentage'
  
  -- Requirements for payout
  min_payout_amount DECIMAL(10,2) DEFAULT 100.00,  -- Minimum to request payout
  
  -- What counts as conversion
  conversion_type VARCHAR(50) DEFAULT 'paid_subscription',  -- 'signup', 'email_verified', 'paid_subscription'
  
  -- Cookie duration (days)
  cookie_days INTEGER DEFAULT 30,
  
  -- Program status
  is_active BOOLEAN DEFAULT true,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO affiliate_settings (
  commission_amount, commission_type, min_payout_amount, 
  conversion_type, cookie_days, is_active
) VALUES (20.00, 'fixed', 100.00, 'paid_subscription', 30, true)
ON CONFLICT DO NOTHING;

-- Each user's affiliate account
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Unique referral code
  ref_code VARCHAR(20) UNIQUE NOT NULL,
  
  -- Stats
  total_clicks INTEGER DEFAULT 0,
  total_signups INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  
  -- Earnings
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  pending_balance DECIMAL(10,2) DEFAULT 0.00,   -- Not yet available for payout
  available_balance DECIMAL(10,2) DEFAULT 0.00, -- Can request payout
  total_paid_out DECIMAL(10,2) DEFAULT 0.00,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track clicks
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
  ref_code VARCHAR(20) NOT NULL,
  
  -- Visitor info
  ip_address VARCHAR(45),
  user_agent TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  
  -- Conversion tracking
  converted_user_id UUID REFERENCES users(id),
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track referrals (signups through affiliate link)
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'converted', 'paid'
  
  -- Commission
  commission_amount DECIMAL(10,2),
  commission_paid_at TIMESTAMPTZ,
  
  -- Tracking
  click_id UUID REFERENCES affiliate_clicks(id),
  converted_at TIMESTAMPTZ,              -- When they became paying customer
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout requests
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
  
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'paid', 'rejected'
  
  -- Payout method
  payout_method VARCHAR(50),             -- 'bank_transfer', 'paypal', 'credit'
  payout_details JSONB,                  -- Bank account / PayPal email etc
  
  -- Admin notes
  admin_notes TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER TABLE UPDATES
-- =====================================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_ever_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID REFERENCES affiliates(id),
ADD COLUMN IF NOT EXISTS referral_click_id UUID;

-- Add to subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS active_promotion_id UUID REFERENCES promotions(id),
ADD COLUMN IF NOT EXISTS promo_months_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS active_coupon_id UUID REFERENCES coupons(id),
ADD COLUMN IF NOT EXISTS coupon_months_remaining INTEGER,      -- NULL if forever, 0 if expired
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS discounted_price DECIMAL(10,2);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_plan ON promotions(plan_id);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(ref_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_user ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON affiliate_clicks(ref_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_status ON affiliate_referrals(status);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE promotions IS 'Auto-applied discounts shown on pricing page (no code needed)';
COMMENT ON TABLE coupons IS 'Discount codes users can enter at checkout';
COMMENT ON TABLE affiliates IS 'User affiliate accounts with referral tracking';
COMMENT ON COLUMN coupons.duration_type IS 'once=first payment only, months=X months, forever=permanent discount';
