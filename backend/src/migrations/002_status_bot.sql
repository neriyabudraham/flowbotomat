-- Status Bot Tables
-- Service for uploading WhatsApp statuses

-- חיבורי WhatsApp לבוט הסטטוסים
CREATE TABLE IF NOT EXISTS status_bot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- WhatsApp connection (similar to whatsapp_connections)
  session_name VARCHAR(100),
  connection_status VARCHAR(20) DEFAULT 'disconnected', -- connected, disconnected, qr_pending, failed
  phone_number VARCHAR(20),
  display_name VARCHAR(100),
  
  -- QR tracking
  last_qr_code TEXT,
  last_qr_at TIMESTAMP,
  
  -- 24-hour restriction after each connection
  first_connected_at TIMESTAMP, -- מתי התחבר לראשונה
  last_connected_at TIMESTAMP, -- מתי התחבר לאחרונה (לחישוב 24 שעות - מתאפס בכל התנתקות)
  restriction_lifted BOOLEAN DEFAULT false, -- האם אדמין שחרר את החסימה
  restriction_lifted_at TIMESTAMP,
  restriction_lifted_by UUID REFERENCES users(id),
  
  -- Settings
  default_text_color VARCHAR(10) DEFAULT '#38b42f', -- צבע ברירת מחדל לסטטוסי טקסט
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- מספרים מורשים להעלאת סטטוסים
CREATE TABLE IF NOT EXISTS status_bot_authorized_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL, -- מספר מורשה (פורמט: 972501234567)
  name VARCHAR(100), -- שם לזיהוי
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(connection_id, phone_number)
);

-- תור שליחת סטטוסים (global queue - 30 seconds between each)
CREATE TABLE IF NOT EXISTS status_bot_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  
  -- Content
  status_type VARCHAR(20) NOT NULL, -- text, image, voice, video
  content JSONB NOT NULL, -- תוכן הסטטוס
  /*
    text: { text, backgroundColor, font, linkPreview }
    image: { url, mimetype, filename, caption }
    voice: { url, mimetype, backgroundColor }
    video: { url, mimetype, filename, caption }
  */
  
  -- Pre-generated status ID
  status_message_id VARCHAR(100), -- ID שנוצר מ-new-message-id
  
  -- Queue status
  queue_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, sent, failed, cancelled
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  scheduled_for TIMESTAMP, -- מתי מתוזמן לשליחה (לפי התור)
  processing_started_at TIMESTAMP,
  sent_at TIMESTAMP,
  
  -- Source
  source VARCHAR(20) DEFAULT 'web', -- web, whatsapp
  source_phone VARCHAR(20), -- מי שלח (אם מווצאפ)
  source_message_id VARCHAR(100) -- ID ההודעה המקורית מווצאפ
);

-- היסטוריית סטטוסים שנשלחו
CREATE TABLE IF NOT EXISTS status_bot_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES status_bot_queue(id) ON DELETE SET NULL,
  
  -- Status info
  status_type VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  waha_message_id VARCHAR(100), -- ID של הסטטוס ב-WAHA
  
  -- Timing
  sent_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- סטטוס פג תוקף אחרי 24 שעות
  deleted_at TIMESTAMP, -- אם נמחק ידנית
  
  -- Source
  source VARCHAR(20),
  source_phone VARCHAR(20),
  
  -- Stats (מתעדכן מ-webhooks)
  view_count INTEGER DEFAULT 0,
  reaction_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- צפיות בסטטוסים
CREATE TABLE IF NOT EXISTS status_bot_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
  
  viewer_phone VARCHAR(20) NOT NULL, -- מי צפה
  viewer_name VARCHAR(100), -- שם (אם ידוע)
  viewed_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(status_id, viewer_phone)
);

-- תגובות (לבבות) לסטטוסים - אפשר מספר תגובות מאותו משתמש
CREATE TABLE IF NOT EXISTS status_bot_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
  
  reactor_phone VARCHAR(20) NOT NULL, -- מי הגיב
  reactor_name VARCHAR(100), -- שם (אם ידוע)
  reaction VARCHAR(10) NOT NULL, -- האימוג'י (בד"כ ❤️)
  reacted_at TIMESTAMP DEFAULT NOW()
  -- No UNIQUE constraint - allow multiple reactions from same user
);

-- תגובות טקסט לסטטוסים (מישהו הגיב עם הודעה)
CREATE TABLE IF NOT EXISTS status_bot_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES status_bot_statuses(id) ON DELETE CASCADE,
  
  replier_phone VARCHAR(20) NOT NULL, -- מי הגיב
  replier_name VARCHAR(100), -- שם (אם ידוע)
  reply_text TEXT, -- תוכן התגובה
  replied_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(status_id, replier_phone)
);

-- Global queue lock - להבטיח 30 שניות בין סטטוסים
CREATE TABLE IF NOT EXISTS status_bot_queue_lock (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_sent_at TIMESTAMP,
  last_sent_connection_id UUID,
  is_processing BOOLEAN DEFAULT false,
  processing_started_at TIMESTAMP,
  
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial lock row
INSERT INTO status_bot_queue_lock (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_status_bot_connections_user ON status_bot_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_connections_status ON status_bot_connections(connection_status);
CREATE INDEX IF NOT EXISTS idx_status_bot_authorized_connection ON status_bot_authorized_numbers(connection_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_queue_status ON status_bot_queue(queue_status);
CREATE INDEX IF NOT EXISTS idx_status_bot_queue_scheduled ON status_bot_queue(scheduled_for) WHERE queue_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_connection ON status_bot_statuses(connection_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_statuses_waha_id ON status_bot_statuses(waha_message_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_views_status ON status_bot_views(status_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_reactions_status ON status_bot_reactions(status_id);
CREATE INDEX IF NOT EXISTS idx_status_bot_replies_status ON status_bot_replies(status_id);

-- Migration: Add last_connected_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'status_bot_connections' AND column_name = 'last_connected_at'
  ) THEN
    ALTER TABLE status_bot_connections ADD COLUMN last_connected_at TIMESTAMP;
  END IF;
END $$;

-- Migration: Add reply_count column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'status_bot_statuses' AND column_name = 'reply_count'
  ) THEN
    ALTER TABLE status_bot_statuses ADD COLUMN reply_count INTEGER DEFAULT 0;
  END IF;
END $$;
