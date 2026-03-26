-- Add per-sender target group permissions
-- Allows restricting which target groups each sender can send to

-- 1. Add auto_add_new_targets column to forward_authorized_senders (default true)
ALTER TABLE forward_authorized_senders
ADD COLUMN IF NOT EXISTS auto_add_new_targets BOOLEAN DEFAULT true;

-- 2. Create sender-group denied permissions table
-- Stores DENIED group_ids per sender. If no row exists = sender is allowed.
CREATE TABLE IF NOT EXISTS forward_sender_group_denied (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    forward_id UUID NOT NULL REFERENCES group_forwards(id) ON DELETE CASCADE,
    sender_phone VARCHAR(50) NOT NULL, -- matches forward_authorized_senders.phone_number
    group_id VARCHAR(100) NOT NULL, -- matches group_forward_targets.group_id
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(forward_id, sender_phone, group_id)
);

CREATE INDEX IF NOT EXISTS idx_sender_group_denied_forward ON forward_sender_group_denied(forward_id);
CREATE INDEX IF NOT EXISTS idx_sender_group_denied_phone ON forward_sender_group_denied(forward_id, sender_phone);
