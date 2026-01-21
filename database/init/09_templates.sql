-- FlowBotomat - Templates Table
-- Stores flow templates (system and community)

-- =============================================
-- TEMPLATES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'general',
    type VARCHAR(20) DEFAULT 'community', -- 'system' or 'community'
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    flow_data JSONB NOT NULL DEFAULT '{}',
    thumbnail_url TEXT,
    tags TEXT[] DEFAULT '{}',
    installs_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE, -- for community templates
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_templates_type ON templates(type);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_creator ON templates(creator_id);

-- =============================================
-- TEMPLATE INSTALLS (tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS template_installs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bot_id UUID,
    installed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(template_id, user_id, bot_id)
);

-- =============================================
-- LOG
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Templates tables created successfully!';
END $$;
