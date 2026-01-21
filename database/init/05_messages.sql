-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Message info
  wa_message_id VARCHAR(100), -- WhatsApp message ID
  direction VARCHAR(10) NOT NULL, -- 'incoming' or 'outgoing'
  
  -- Content
  message_type VARCHAR(20) NOT NULL, -- text, image, video, audio, document, sticker, location, contact, list
  content TEXT, -- Text content or caption
  media_url TEXT, -- URL for media
  media_mime_type VARCHAR(50),
  media_filename VARCHAR(255),
  
  -- For location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Status (for outgoing)
  status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read, failed
  
  -- If sent by bot flow
  flow_id UUID,
  node_id VARCHAR(100),
  
  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent ON messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

SELECT 'Messages table created!' as status;
