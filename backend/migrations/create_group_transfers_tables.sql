-- Group Transfers tables (duplicate of Group Forwards)
-- This module handles message transfers between groups

-- Main transfers table
CREATE TABLE IF NOT EXISTS group_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT false,
    trigger_type VARCHAR(50) DEFAULT 'direct', -- 'direct' or 'listen'
    trigger_group_id VARCHAR(255),
    trigger_group_name VARCHAR(255),
    delay_min INTEGER DEFAULT 3,
    delay_max INTEGER DEFAULT 10,
    require_confirmation BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Target groups for each transfer
CREATE TABLE IF NOT EXISTS group_transfer_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES group_transfers(id) ON DELETE CASCADE,
    group_id VARCHAR(255) NOT NULL,
    group_name VARCHAR(255),
    group_image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Authorized senders for each transfer
CREATE TABLE IF NOT EXISTS transfer_authorized_senders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES group_transfers(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(transfer_id, phone_number)
);

-- Transfer jobs (individual execution instances)
CREATE TABLE IF NOT EXISTS transfer_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transfer_id UUID REFERENCES group_transfers(id) ON DELETE SET NULL,
    transfer_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'sending', 'completed', 'failed', 'stopped', 'cancelled'
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'video', 'audio', 'document'
    message_content TEXT,
    media_url TEXT,
    media_caption TEXT,
    media_filename VARCHAR(255),
    target_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    sender_phone VARCHAR(50),
    stop_requested BOOLEAN DEFAULT false,
    delete_sent_requested BOOLEAN DEFAULT false,
    trigger_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual messages for each job
CREATE TABLE IF NOT EXISTS transfer_job_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES transfer_jobs(id) ON DELETE CASCADE,
    target_id UUID REFERENCES group_transfer_targets(id) ON DELETE SET NULL,
    message_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'deleted'
    error_message TEXT,
    sent_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_transfers_user_id ON group_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_group_transfer_targets_transfer_id ON group_transfer_targets(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_authorized_senders_transfer_id ON transfer_authorized_senders(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_jobs_user_id ON transfer_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_jobs_transfer_id ON transfer_jobs(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_jobs_status ON transfer_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transfer_job_messages_job_id ON transfer_job_messages(job_id);
