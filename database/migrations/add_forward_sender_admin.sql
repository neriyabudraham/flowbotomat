-- Add is_admin flag to forward_authorized_senders
-- Each forward can have at most one admin sender
-- The admin receives approval requests and can cascade-delete broadcast messages

ALTER TABLE forward_authorized_senders
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Ensure only one admin per forward (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_forward_senders_one_admin
  ON forward_authorized_senders (forward_id)
  WHERE is_admin = true;

SELECT 'forward_authorized_senders.is_admin added!' as status;
