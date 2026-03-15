-- Optimize contacts list query performance

-- 1. Add last_message column to contacts for O(1) preview without subquery
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message TEXT;

-- Backfill from messages table (one-time, only for contacts missing it)
UPDATE contacts c
SET last_message = (
  SELECT content FROM messages m
  WHERE m.contact_id = c.id
  ORDER BY sent_at DESC LIMIT 1
)
WHERE c.last_message IS NULL
  AND EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id);

-- 2. Composite index for fast per-contact message lookup (LATERAL join fallback)
CREATE INDEX IF NOT EXISTS idx_messages_contact_sent
  ON messages(contact_id, sent_at DESC);

-- 3. Composite index for contacts list query (user_id + last_message_at for sort)
CREATE INDEX IF NOT EXISTS idx_contacts_user_last_msg
  ON contacts(user_id, last_message_at DESC NULLS LAST);
