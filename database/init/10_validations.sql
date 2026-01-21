-- FlowBotomat - Validations Table
-- Stores reusable API-based validations

CREATE TABLE IF NOT EXISTS validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- API Configuration
    api_url TEXT NOT NULL,
    api_method VARCHAR(10) DEFAULT 'GET',
    api_headers JSONB DEFAULT '{}',
    api_body TEXT,
    
    -- Condition Configuration
    response_path VARCHAR(255) NOT NULL, -- e.g., "data.isValid", "status", "result.allowed"
    expected_value TEXT NOT NULL,        -- e.g., "true", "1", "active"
    comparison VARCHAR(20) DEFAULT 'equals', -- equals, not_equals, contains, greater_than, less_than, exists
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_validations_user ON validations(user_id);

-- Log
DO $$
BEGIN
  RAISE NOTICE '✅ Validations table created successfully!';
END $$;
