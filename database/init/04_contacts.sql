-- Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- WhatsApp info
  phone VARCHAR(20) NOT NULL,
  wa_id VARCHAR(50), -- WhatsApp ID (phone@s.whatsapp.net)
  display_name VARCHAR(100),
  profile_picture_url TEXT,
  
  -- Status
  is_bot_active BOOLEAN DEFAULT TRUE, -- Bot responds to this contact
  is_blocked BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, phone)
);

-- Contact Tags Table
CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- Contact-Tag relationship
CREATE TABLE IF NOT EXISTS contact_tag_assignments (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (contact_id, tag_id)
);

-- Contact Variables (CRM fields)
CREATE TABLE IF NOT EXISTS contact_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  key VARCHAR(50) NOT NULL,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(contact_id, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_last_msg ON contacts(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_vars ON contact_variables(contact_id);

SELECT 'Contacts tables created!' as status;
