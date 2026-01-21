-- FlowBotomat - Database Tables
-- Version 1.0

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role user_role DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    plan_id UUID,
    language VARCHAR(5) DEFAULT 'he',
    theme VARCHAR(10) DEFAULT 'light',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    verified_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- =============================================
-- VERIFICATION TOKENS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    code VARCHAR(6),
    type verification_type NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    used_at TIMESTAMP
);

CREATE INDEX idx_verification_user ON verification_tokens(user_id);
CREATE INDEX idx_verification_token ON verification_tokens(token);

-- =============================================
-- PLANS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    name_he VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'ILS',
    billing_period billing_period DEFAULT 'monthly',
    max_messages INT DEFAULT 100,
    max_flows INT DEFAULT 3,
    max_instances INT DEFAULT 1,
    max_contacts INT DEFAULT 50,
    max_variables INT DEFAULT 10,
    max_media_mb INT DEFAULT 100,
    feature_flags JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default free plan
INSERT INTO plans (name, name_he, description, price, max_messages, max_flows, max_instances, max_contacts, max_variables, max_media_mb, feature_flags)
VALUES ('Free', 'חינם', 'תוכנית חינמית', 0, 100, 3, 1, 50, 10, 100, '{"api_node": false, "templates": true, "community_templates": false, "export": false}')
ON CONFLICT DO NOTHING;

-- =============================================
-- LOG
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Tables created successfully!';
END $$;
