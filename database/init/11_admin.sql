-- FlowBotomat - Admin Tables
-- System settings and error logs

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
('app', '{"name":"FlowBotomat","logo_url":"","default_language":"he"}', 'הגדרות אפליקציה'),
('smtp', '{"host":"","port":587,"user":"","pass":"","from":""}', 'הגדרות SMTP'),
('security', '{"session_timeout_hours":24,"max_login_attempts":5,"password_min_length":8}', 'הגדרות אבטחה'),
('backup', '{"enabled":true,"frequency":"daily","retention_days":7}', 'הגדרות גיבוי'),
('plans', '[{"id":"free","name":"חינמי","description":"לניסיון ראשוני","price":0,"color":"gray","limits":{"bots":1,"contacts":50,"messages_per_month":500,"media_mb":100}},{"id":"basic","name":"בסיסי","description":"לעסקים קטנים","price":49,"color":"blue","limits":{"bots":3,"contacts":500,"messages_per_month":5000,"media_mb":500}},{"id":"premium","name":"פרימיום","description":"לעסקים בינוניים","price":149,"color":"purple","limits":{"bots":10,"contacts":5000,"messages_per_month":50000,"media_mb":2000}},{"id":"enterprise","name":"ארגוני","description":"ללא מגבלות","price":499,"color":"amber","limits":{"bots":-1,"contacts":-1,"messages_per_month":-1,"media_mb":-1}}]', 'תוכניות מנוי')
ON CONFLICT (key) DO NOTHING;

-- Error Logs
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    flow_id UUID,
    node_id VARCHAR(100),
    contact_id UUID,
    
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    payload_snapshot JSONB,
    
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);

-- Audit Logs (for tracking admin actions)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

-- Add plan column to users if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'plan'
    ) THEN
        ALTER TABLE users ADD COLUMN plan VARCHAR(50) DEFAULT 'free';
        RAISE NOTICE '✅ Added plan column to users table';
    END IF;
END $$;

-- Log
DO $$
BEGIN
  RAISE NOTICE '✅ Admin tables created successfully!';
END $$;
