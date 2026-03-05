-- Add is_admin flag to transfer_authorized_senders
-- Each transfer can have at most one admin sender
-- The admin can cascade-delete transferred messages by deleting from one group

ALTER TABLE transfer_authorized_senders
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_senders_one_admin
  ON transfer_authorized_senders (transfer_id)
  WHERE is_admin = true;

-- Also add deleted_at to transfer_job_messages for tracking cascade deletions
ALTER TABLE transfer_job_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

SELECT 'transfer_authorized_senders.is_admin + transfer_job_messages.deleted_at added!' as status;
