-- Credit card requirement system
-- This allows requiring credit card for WhatsApp connection

-- Add credit card exempt flag to users (for specific users that don't need credit card)
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_card_exempt BOOLEAN DEFAULT false;

-- Add system setting for global credit card requirement
INSERT INTO system_settings (key, value, description, created_at, updated_at)
VALUES (
  'require_credit_card_for_whatsapp', 
  'true',
  'חובת הזנת כרטיס אשראי לפני חיבור וואטסאפ'
, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- Create table for direct payment links
CREATE TABLE IF NOT EXISTS direct_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_payment_links_token ON direct_payment_links(token);
CREATE INDEX IF NOT EXISTS idx_direct_payment_links_user ON direct_payment_links(user_id);

-- Add comment
COMMENT ON COLUMN users.credit_card_exempt IS 'If true, user does not need credit card to connect WhatsApp';
