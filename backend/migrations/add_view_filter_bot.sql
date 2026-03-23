-- View Filter Bot Service Migration
-- Adds 90-day status viewer tracking campaign system

-- =============================================
-- STATUS VIEWER CAMPAIGNS
-- Tracks a user's 90-day tracking period
-- =============================================
CREATE TABLE IF NOT EXISTS status_viewer_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP NOT NULL,           -- started_at + 90 days
  status VARCHAR(20) DEFAULT 'active',  -- 'active' | 'completed'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)                        -- one campaign per user at a time
);

CREATE INDEX IF NOT EXISTS idx_svc_user ON status_viewer_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_svc_status ON status_viewer_campaigns(status);

-- =============================================
-- ADD renewal_price TO additional_services
-- Discounted price for users who already paid once
-- =============================================
ALTER TABLE additional_services
  ADD COLUMN IF NOT EXISTS renewal_price DECIMAL(10,2) DEFAULT NULL;

COMMENT ON COLUMN additional_services.renewal_price IS
  'Discounted price for re-subscribing users. NULL = same as regular price.';

-- =============================================
-- ADD slot TO user_integrations
-- Supports multiple Google accounts per user
-- =============================================
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS slot INTEGER DEFAULT 0;

-- Migrate existing rows to slot = 0
UPDATE user_integrations SET slot = 0 WHERE slot IS NULL;

-- Drop old unique constraint (user_id, integration_type) and add new one with slot
ALTER TABLE user_integrations
  DROP CONSTRAINT IF EXISTS user_integrations_user_id_integration_type_key;

ALTER TABLE user_integrations
  ADD CONSTRAINT IF NOT EXISTS user_integrations_user_integration_slot_unique
  UNIQUE (user_id, integration_type, slot);

CREATE INDEX IF NOT EXISTS idx_user_integrations_slot
  ON user_integrations(user_id, integration_type, slot);

-- =============================================
-- SEED: View Filter Bot service
-- =============================================
INSERT INTO additional_services (
  slug, name, name_he,
  description, description_he,
  price, yearly_price, renewal_price,
  trial_days, allow_custom_trial,
  icon, color, external_url,
  features, is_active, is_coming_soon, sort_order
) VALUES (
  'view-filter-bot',
  'Status Viewers Filter',
  'בוט סינון צפיות',
  'Track who actually views your WhatsApp statuses over 90 days',
  'גלה מי באמת צופה בסטטוסים שלך לאורך 90 יום',
  199,
  1990,
  99,   -- renewal price (set via admin panel)
  0,
  true,
  'eye',
  'from-purple-500 to-violet-600',
  '/view-filter/dashboard',
  '{"viewer_tracking": true, "gray_checkmark": true, "90_day_period": true, "google_sync": true, "download_report": true}',
  true,
  false,
  2
) ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- ADD is_primary + track_since TO status_viewer_campaigns
-- Required for multi-campaign support and all-time tracking
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'status_viewer_campaigns' AND column_name = 'is_primary'
  ) THEN
    ALTER TABLE status_viewer_campaigns ADD COLUMN is_primary BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'status_viewer_campaigns' AND column_name = 'track_since'
  ) THEN
    ALTER TABLE status_viewer_campaigns ADD COLUMN track_since TIMESTAMP;
  END IF;
END $$;

-- Drop the old UNIQUE(user_id) constraint so multiple campaigns can exist per user
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'status_viewer_campaigns_user_id_key') THEN
    ALTER TABLE status_viewer_campaigns DROP CONSTRAINT status_viewer_campaigns_user_id_key;
  END IF;
END $$;

-- Mark each user's most recent campaign as primary (migrate existing data)
UPDATE status_viewer_campaigns svc
SET is_primary = true
WHERE svc.id IN (
  SELECT DISTINCT ON (user_id) id
  FROM status_viewer_campaigns
  ORDER BY user_id, created_at DESC
) AND svc.is_primary = false;

CREATE INDEX IF NOT EXISTS idx_svc_primary ON status_viewer_campaigns(user_id, is_primary);

DO $$
BEGIN
  RAISE NOTICE '✅ View Filter Bot migration complete!';
END $$;
