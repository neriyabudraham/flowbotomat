-- Bot Templates Table
CREATE TABLE IF NOT EXISTS bot_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    name_he VARCHAR(255),
    description TEXT,
    description_he TEXT,
    
    -- Categorization
    category VARCHAR(50) DEFAULT 'general', -- general, sales, support, marketing, etc.
    tags TEXT[], -- Array of tags for filtering
    
    -- Template Data (same structure as bots)
    flow_data JSONB DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    trigger_config JSONB DEFAULT '{}'::jsonb,
    
    -- Preview/Marketing
    thumbnail_url TEXT,
    preview_images TEXT[],
    demo_video_url TEXT,
    
    -- Stats
    use_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    
    -- Publishing
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    
    -- Pricing (for future)
    is_premium BOOLEAN DEFAULT false,
    price DECIMAL(10,2) DEFAULT 0,
    
    -- Creator
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template Categories Table
CREATE TABLE IF NOT EXISTS template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    name_he VARCHAR(100),
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default categories
INSERT INTO template_categories (name, name_he, description, icon, color, sort_order) VALUES
    ('general', 'כללי', 'תבניות כלליות לשימוש יומיומי', 'Grid', 'gray', 1),
    ('sales', 'מכירות', 'תבניות לתהליכי מכירה ולידים', 'TrendingUp', 'green', 2),
    ('support', 'תמיכה', 'תבניות לשירות לקוחות', 'HeadphonesIcon', 'blue', 3),
    ('marketing', 'שיווק', 'תבניות לקמפיינים שיווקיים', 'Megaphone', 'purple', 4),
    ('booking', 'תורים', 'תבניות לניהול תורים ופגישות', 'Calendar', 'orange', 5),
    ('ecommerce', 'מסחר', 'תבניות לחנויות אונליין', 'ShoppingBag', 'pink', 6)
ON CONFLICT (name) DO NOTHING;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_templates_published ON bot_templates(is_published);
CREATE INDEX IF NOT EXISTS idx_templates_category ON bot_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_featured ON bot_templates(is_featured);
