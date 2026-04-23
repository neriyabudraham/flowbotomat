-- Imported contacts for status bot (contacts format only)
-- Users can upload CSV/VCF/manual phone lists. These phones are added to the
-- send pipeline when the format is 'contacts', independent of WAHA cache.
-- These are NOT system contacts and NOT visible anywhere outside the status bot.

CREATE TABLE IF NOT EXISTS status_bot_imported_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  display_name VARCHAR(128),
  source VARCHAR(16) NOT NULL DEFAULT 'manual',  -- manual | csv | vcf
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (connection_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_status_bot_imported_contacts_conn
  ON status_bot_imported_contacts(connection_id);

CREATE INDEX IF NOT EXISTS idx_status_bot_imported_contacts_user
  ON status_bot_imported_contacts(user_id);

-- Toggle: when true, imported contacts are appended to contacts-format sends
ALTER TABLE status_bot_connections
  ADD COLUMN IF NOT EXISTS use_imported_contacts BOOLEAN DEFAULT TRUE;

-- System-level default limit for how many imported contacts a user can hold
INSERT INTO system_settings (key, value, description)
VALUES (
  'statusbot_imported_contacts_max_per_user',
  '50000',
  'Maximum number of imported contacts per status bot connection (upload limit)'
)
ON CONFLICT (key) DO NOTHING;
