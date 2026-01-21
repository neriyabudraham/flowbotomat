-- FlowBotomat - Notifications System

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification content
    type VARCHAR(50) NOT NULL, -- share_received, share_accepted, bot_error, quota_warning, system
    title VARCHAR(255) NOT NULL,
    message TEXT,
    
    -- Related entities
    related_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Extra data (JSON)
    metadata JSONB DEFAULT '{}',
    
    -- Action URL
    action_url VARCHAR(500),
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Email notifications
    email_share_received BOOLEAN DEFAULT TRUE,
    email_bot_errors BOOLEAN DEFAULT TRUE,
    email_quota_warnings BOOLEAN DEFAULT TRUE,
    email_weekly_digest BOOLEAN DEFAULT TRUE,
    
    -- In-app notifications
    app_share_received BOOLEAN DEFAULT TRUE,
    app_bot_activity BOOLEAN DEFAULT TRUE,
    app_system_updates BOOLEAN DEFAULT TRUE,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity log for bots (for notifications)
CREATE TABLE IF NOT EXISTS bot_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    activity_type VARCHAR(50) NOT NULL, -- trigger, message_sent, error, user_joined
    details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_activity_bot ON bot_activity_log(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_activity_created ON bot_activity_log(created_at DESC);

-- Log
DO $$
BEGIN
  RAISE NOTICE '✅ Notifications tables created successfully!';
END $$;
