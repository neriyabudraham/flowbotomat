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
    path_source VARCHAR(20) DEFAULT 'specific', -- 'specific' for response_path, 'full' for entire data
    response_path VARCHAR(255) DEFAULT '',      -- e.g., "data.isValid", "status", "result.allowed"
    expected_value TEXT DEFAULT '',             -- e.g., "true", "1", "active"
    comparison VARCHAR(20) DEFAULT 'equals',    -- equals, not_equals, contains, greater_than, etc.
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_validations_user ON validations(user_id);

-- Migration: Add path_source column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'validations' AND column_name = 'path_source'
    ) THEN
        ALTER TABLE validations ADD COLUMN path_source VARCHAR(20) DEFAULT 'specific';
        RAISE NOTICE '✅ Added path_source column to validations table';
    END IF;
    
    -- Make response_path and expected_value nullable
    ALTER TABLE validations ALTER COLUMN response_path DROP NOT NULL;
    ALTER TABLE validations ALTER COLUMN expected_value DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Log
DO $$
BEGIN
  RAISE NOTICE '✅ Validations table created/updated successfully!';
END $$;
