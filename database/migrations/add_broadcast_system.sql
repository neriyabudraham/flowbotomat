-- Broadcast System Tables
-- Migration: add_broadcast_system.sql

-- ============================================
-- Custom Contact Fields Definition (per user)
-- ============================================
CREATE TABLE IF NOT EXISTS contact_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_key VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'text', -- text, number, date, email, phone, select
  is_required BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE, -- true for phone, name etc.
  select_options JSONB, -- for select type fields
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, field_key)
);

-- ============================================
-- Broadcast Audiences
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_audiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Filter criteria (JSONB for flexible filtering)
  -- Example: { "tags": ["vip"], "custom_fields": {"city": "Tel Aviv"}, "has_whatsapp": true }
  filter_criteria JSONB DEFAULT '{}',
  
  -- Can also be a static list
  is_static BOOLEAN DEFAULT FALSE, -- true = manual contact list, false = dynamic filter
  
  contacts_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Static audience contacts (when is_static = true)
CREATE TABLE IF NOT EXISTS broadcast_audience_contacts (
  audience_id UUID NOT NULL REFERENCES broadcast_audiences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (audience_id, contact_id)
);

-- ============================================
-- Broadcast Templates
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Template can have multiple messages sent in sequence
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual messages within a template
CREATE TABLE IF NOT EXISTS broadcast_template_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES broadcast_templates(id) ON DELETE CASCADE,
  
  message_order INTEGER NOT NULL DEFAULT 1,
  
  -- Message content
  message_type VARCHAR(20) DEFAULT 'text', -- text, image, video, audio, document, buttons
  content TEXT, -- Main text content with {{variable}} placeholders
  media_url TEXT, -- For media messages
  media_caption TEXT, -- Caption for media
  
  -- For buttons type
  buttons JSONB, -- [{"id": "btn1", "text": "Click me"}]
  
  -- Delay before sending this message (in seconds)
  delay_seconds INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Broadcast Campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Source
  template_id UUID REFERENCES broadcast_templates(id) ON DELETE SET NULL,
  audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL,
  
  -- Or direct message (when not using template)
  direct_message TEXT,
  direct_media_url TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, running, paused, completed, cancelled, failed
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE, -- NULL = send immediately
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Settings
  settings JSONB DEFAULT '{
    "delay_between_messages": 2,
    "delay_between_batches": 30,
    "batch_size": 50,
    "skip_invalid_numbers": true,
    "skip_blocked_contacts": true
  }',
  
  -- Stats
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Campaign Recipients
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Contact info (stored for history even if contact deleted)
  phone VARCHAR(20) NOT NULL,
  contact_name VARCHAR(100),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, sending, sent, delivered, read, failed
  error_message TEXT,
  
  -- Timestamps
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Message IDs from WhatsApp
  waha_message_ids JSONB DEFAULT '[]'
);

-- ============================================
-- Contact Import Jobs
-- ============================================
CREATE TABLE IF NOT EXISTS contact_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  file_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Mapping configuration
  field_mapping JSONB NOT NULL, -- {"column_name": "field_key", "טלפון": "phone", "שם": "name"}
  
  -- Stats
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  
  -- Target audience (optional)
  target_audience_id UUID REFERENCES broadcast_audiences(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_broadcast_audiences_user ON broadcast_audiences(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_templates_user ON broadcast_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_user ON broadcast_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status ON broadcast_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_scheduled ON broadcast_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON broadcast_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON broadcast_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_contact_field_defs_user ON contact_field_definitions(user_id);

-- ============================================
-- Insert default system fields
-- ============================================
-- These will be added per-user when they first access broadcasts

SELECT 'Broadcast system tables created!' as status;
