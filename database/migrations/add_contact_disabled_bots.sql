-- Create contact_disabled_bots table if not exists
CREATE TABLE IF NOT EXISTS contact_disabled_bots (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, bot_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_contact_disabled_bots_contact ON contact_disabled_bots(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_disabled_bots_bot ON contact_disabled_bots(bot_id);
