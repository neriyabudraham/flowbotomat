-- Account Switching & Enhanced Expert Access
-- Adds support for access requests and linked accounts

-- Add status field to expert_clients for pending requests
ALTER TABLE expert_clients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
-- 'pending' - waiting for approval
-- 'approved' - access granted
-- 'rejected' - access denied

-- Add request_message field for access requests
ALTER TABLE expert_clients ADD COLUMN IF NOT EXISTS request_message TEXT;

-- Add requested_at field
ALTER TABLE expert_clients ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP DEFAULT NOW();

-- Add rejected_at field
ALTER TABLE expert_clients ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- Add rejection_reason field
ALTER TABLE expert_clients ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Linked accounts table - for accounts created by a parent account
CREATE TABLE IF NOT EXISTS linked_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    -- Prevent duplicate relationships
    UNIQUE(parent_user_id, child_user_id)
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_parent ON linked_accounts(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_child ON linked_accounts(child_user_id);

-- Comments
COMMENT ON COLUMN expert_clients.status IS 'Access request status: pending, approved, rejected';
COMMENT ON TABLE linked_accounts IS 'Tracks accounts created by other accounts - the child is a separate account but linked to parent';
