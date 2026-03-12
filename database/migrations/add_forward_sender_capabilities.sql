-- Add granular capability columns to forward_authorized_senders
-- is_admin (existing) = super admin who approves/rejects messages (one per forward)
-- can_send_without_approval = mid-level admin who can send without needing approval
-- can_delete_from_all_groups = can cascade-delete broadcast from all target groups

ALTER TABLE forward_authorized_senders
  ADD COLUMN IF NOT EXISTS can_send_without_approval BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete_from_all_groups BOOLEAN DEFAULT false;

-- Same for transfer_authorized_senders if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'transfer_authorized_senders'
  ) THEN
    ALTER TABLE transfer_authorized_senders
      ADD COLUMN IF NOT EXISTS can_send_without_approval BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_delete_from_all_groups BOOLEAN DEFAULT false;
  END IF;
END $$;

SELECT 'forward_authorized_senders capabilities added!' as status;
