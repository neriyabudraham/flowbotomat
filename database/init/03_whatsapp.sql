-- WhatsApp Connections Table
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Connection type: 'managed' (system creates) or 'external' (user provides)
  connection_type VARCHAR(20) NOT NULL DEFAULT 'managed',
  
  -- For external connections only (encrypted)
  external_base_url TEXT,
  external_api_key TEXT,
  
  -- Session info
  session_name VARCHAR(100) NOT NULL,
  
  -- WhatsApp account info (after QR scan)
  phone_number VARCHAR(20),
  display_name VARCHAR(100),
  profile_picture_url TEXT,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  -- disconnected, qr_pending, connected, failed
  
  last_qr_code TEXT,
  last_qr_at TIMESTAMP WITH TIME ZONE,
  connected_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_user ON whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_session ON whatsapp_connections(session_name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_connections(status);

SELECT 'WhatsApp tables created!' as status;
