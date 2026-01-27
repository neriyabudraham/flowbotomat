-- FlowBotomat - Group Forwards (Message Forwarding Between Groups)
-- Version 1.0

-- =============================================
-- GROUP FORWARDS TABLE (Main forwarding rules)
-- =============================================
CREATE TABLE IF NOT EXISTS group_forwards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    
    -- Trigger configuration
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'direct', -- 'direct' (message to bot) or 'group' (listen to group)
    trigger_group_id VARCHAR(100), -- WhatsApp group ID if trigger_type is 'group'
    trigger_group_name VARCHAR(255), -- Group name for display
    
    -- Delay configuration (in seconds, 0 = no delay)
    delay_min INT DEFAULT 3, -- Minimum delay between messages (seconds)
    delay_max INT DEFAULT 10, -- Maximum delay (for variable delay)
    
    -- Confirmation settings
    require_confirmation BOOLEAN DEFAULT true, -- Ask user before sending
    
    -- Statistics
    total_forwards INT DEFAULT 0,
    last_forward_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_group_forwards_user ON group_forwards(user_id);
CREATE INDEX idx_group_forwards_active ON group_forwards(is_active);

-- =============================================
-- GROUP FORWARD TARGETS (Target groups for each forward)
-- =============================================
CREATE TABLE IF NOT EXISTS group_forward_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    forward_id UUID NOT NULL REFERENCES group_forwards(id) ON DELETE CASCADE,
    group_id VARCHAR(100) NOT NULL, -- WhatsApp group JID
    group_name VARCHAR(255), -- Group name for display
    group_image_url TEXT, -- Group image
    sort_order INT DEFAULT 0, -- Order in which messages are sent
    is_active BOOLEAN DEFAULT true,
    
    -- Statistics per target
    messages_sent INT DEFAULT 0,
    last_sent_at TIMESTAMP,
    last_error TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(forward_id, group_id)
);

CREATE INDEX idx_forward_targets_forward ON group_forward_targets(forward_id);
CREATE INDEX idx_forward_targets_order ON group_forward_targets(sort_order);

-- =============================================
-- AUTHORIZED SENDERS (Who can trigger forwards)
-- =============================================
CREATE TABLE IF NOT EXISTS forward_authorized_senders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    forward_id UUID NOT NULL REFERENCES group_forwards(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) NOT NULL, -- Phone number in WhatsApp format
    name VARCHAR(255), -- Display name
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(forward_id, phone_number)
);

CREATE INDEX idx_forward_senders_forward ON forward_authorized_senders(forward_id);

-- =============================================
-- FORWARD JOBS (Active forwarding jobs)
-- =============================================
CREATE TABLE IF NOT EXISTS forward_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    forward_id UUID NOT NULL REFERENCES group_forwards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Job status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'sending', 'completed', 'stopped', 'error'
    
    -- Message content
    message_type VARCHAR(20) NOT NULL, -- 'text', 'image', 'video', 'audio'
    message_text TEXT, -- Text content or caption
    media_url TEXT, -- URL of media file
    media_mime_type VARCHAR(50),
    media_filename VARCHAR(255),
    
    -- Sender info
    sender_phone VARCHAR(30),
    sender_name VARCHAR(255),
    
    -- Progress tracking
    total_targets INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    current_target_index INT DEFAULT 0,
    
    -- Control
    stop_requested BOOLEAN DEFAULT false,
    delete_sent_requested BOOLEAN DEFAULT false,
    
    -- Results
    error_message TEXT,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_forward_jobs_forward ON forward_jobs(forward_id);
CREATE INDEX idx_forward_jobs_user ON forward_jobs(user_id);
CREATE INDEX idx_forward_jobs_status ON forward_jobs(status);

-- =============================================
-- FORWARD JOB MESSAGES (Individual message sends)
-- =============================================
CREATE TABLE IF NOT EXISTS forward_job_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES forward_jobs(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES group_forward_targets(id) ON DELETE CASCADE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'deleted'
    
    -- WhatsApp message info
    whatsapp_message_id VARCHAR(100), -- For deletion if needed
    
    -- Timing
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Error info
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_job_messages_job ON forward_job_messages(job_id);
CREATE INDEX idx_job_messages_status ON forward_job_messages(status);

-- =============================================
-- ADD PLAN LIMITS FOR GROUP FORWARDS
-- =============================================
DO $$
BEGIN
    -- Add max_group_forwards column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'subscription_plans' AND column_name = 'max_group_forwards') THEN
        ALTER TABLE subscription_plans ADD COLUMN max_group_forwards INT DEFAULT 0;
    END IF;
    
    -- Add max_forward_targets column if not exists (per forward)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'subscription_plans' AND column_name = 'max_forward_targets') THEN
        ALTER TABLE subscription_plans ADD COLUMN max_forward_targets INT DEFAULT 0;
    END IF;
    
    -- Add allow_group_forwards feature flag if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'subscription_plans' AND column_name = 'allow_group_forwards') THEN
        ALTER TABLE subscription_plans ADD COLUMN allow_group_forwards BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Update existing plans with default values (adjust as needed)
-- Free plan: no group forwards
-- Basic plan: 1 forward, 10 targets
-- Pro plan: 5 forwards, 50 targets
-- Enterprise: unlimited (-1)

UPDATE subscription_plans SET 
    max_group_forwards = 0, 
    max_forward_targets = 0,
    allow_group_forwards = false 
WHERE name = 'Free' OR name = 'free';

UPDATE subscription_plans SET 
    max_group_forwards = 1, 
    max_forward_targets = 20,
    allow_group_forwards = true 
WHERE name = 'Basic' OR name = 'basic';

UPDATE subscription_plans SET 
    max_group_forwards = 5, 
    max_forward_targets = 100,
    allow_group_forwards = true 
WHERE name = 'Pro' OR name = 'pro';

UPDATE subscription_plans SET 
    max_group_forwards = -1, 
    max_forward_targets = -1,
    allow_group_forwards = true 
WHERE name = 'Enterprise' OR name = 'enterprise';

-- =============================================
-- LOG
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Group Forwards tables created successfully!';
END $$;
