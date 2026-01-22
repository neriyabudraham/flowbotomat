-- Migration: Add notification preferences table
-- Run: docker exec -i flowbotomat_db psql -U $DB_USER -d $DB_NAME < database/migrations/add_notification_preferences.sql

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Email notifications
    email_subscription BOOLEAN DEFAULT true,      -- רכישה ומנוי
    email_updates BOOLEAN DEFAULT true,           -- שדרוגים ועדכונים
    email_critical BOOLEAN DEFAULT true,          -- עדכונים קריטיים (always true)
    email_promos BOOLEAN DEFAULT true,            -- הצעות והטבות
    email_newsletter BOOLEAN DEFAULT true,        -- ניוזלטר
    
    -- App notifications (in-app)
    app_subscription BOOLEAN DEFAULT true,        -- רכישה ומנוי
    app_updates BOOLEAN DEFAULT true,             -- שדרוגים ועדכונים
    app_critical BOOLEAN DEFAULT true,            -- עדכונים קריטיים (always true)
    app_promos BOOLEAN DEFAULT true,              -- הצעות והטבות
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- Add notification_category to system_notifications if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_notifications' AND column_name = 'category') THEN
        ALTER TABLE system_notifications ADD COLUMN category VARCHAR(50) DEFAULT 'system';
    END IF;
END $$;

-- Comment
COMMENT ON TABLE notification_preferences IS 'User notification preferences for email and in-app notifications';
