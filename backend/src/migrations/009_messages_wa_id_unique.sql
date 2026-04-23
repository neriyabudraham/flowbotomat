-- Prevent duplicate message rows for the same WhatsApp message.
-- Two writers (the broadcast sender + the WAHA webhook handleOutgoingDeviceMessage)
-- can race to INSERT the same wa_message_id. Without a unique constraint, both
-- rows commit and the live-chat UI shows the message twice.
--
-- Step 1: widen wa_message_id so long broadcast/group IDs always fit
-- Step 2: de-dupe existing rows (keep earliest per wa_message_id/user)
-- Step 3: add the partial unique index so ON CONFLICT works going forward

ALTER TABLE messages ALTER COLUMN wa_message_id TYPE VARCHAR(200);

-- Keep earliest row per duplicate group, delete the rest
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, wa_message_id
           ORDER BY sent_at ASC, created_at ASC, id ASC
         ) AS rn
  FROM messages
  WHERE wa_message_id IS NOT NULL AND direction = 'outgoing'
)
DELETE FROM messages m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- Partial unique index — wa_message_id can still be NULL on incoming rows that
-- lack a WhatsApp id, so the constraint only enforces uniqueness where present.
CREATE UNIQUE INDEX IF NOT EXISTS messages_user_wa_id_unique
  ON messages (user_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
