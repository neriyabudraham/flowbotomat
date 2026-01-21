-- Add language column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'he';

SELECT 'Language column added!' as status;
