-- FlowBotomat - User Variables Table
-- Stores variable definitions per user (not values, just names/metadata)

-- =============================================
-- USER VARIABLE DEFINITIONS
-- =============================================
CREATE TABLE IF NOT EXISTS user_variable_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(255),
    description TEXT,
    default_value TEXT,
    var_type VARCHAR(50) DEFAULT 'text', -- text, number, date, boolean
    is_system BOOLEAN DEFAULT FALSE, -- TRUE for system variables (read-only)
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX idx_user_variables_user ON user_variable_definitions(user_id);

-- Insert default system variables for reference (will be created per user on first bot creation)
-- System variables are: name, phone, message, date, time, day, bot_name, etc.

-- =============================================
-- LOG
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ User variables table created successfully!';
END $$;
