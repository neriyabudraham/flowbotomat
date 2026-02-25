-- Add no_suffix column to group_forward_targets
ALTER TABLE group_forward_targets
ADD COLUMN IF NOT EXISTS no_suffix BOOLEAN DEFAULT false;

-- Add scheduled_date column to forward_jobs (for storing selected date during scheduling flow)
ALTER TABLE forward_jobs
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Create scheduled_forwards table for message scheduling
CREATE TABLE IF NOT EXISTS scheduled_forwards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    forward_id UUID NOT NULL REFERENCES group_forwards(id) ON DELETE CASCADE,
    
    -- Message content
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text, image, video, audio, document
    message_content TEXT,
    media_url TEXT,
    media_filename TEXT,
    media_caption TEXT,
    
    -- Schedule info
    scheduled_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, sent, failed, cancelled
    
    -- Execution info
    executed_at TIMESTAMP,
    error_message TEXT,
    job_id UUID REFERENCES forward_jobs(id),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_forwards_user_status ON scheduled_forwards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_forwards_scheduled_at ON scheduled_forwards(scheduled_at) WHERE status = 'pending';

COMMENT ON TABLE scheduled_forwards IS 'Scheduled messages for group forwards (broadcasts)';
