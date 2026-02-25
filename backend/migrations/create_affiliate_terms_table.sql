-- Create affiliate_terms table for storing affiliate program terms and conditions
CREATE TABLE IF NOT EXISTS affiliate_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL DEFAULT '',
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default empty content if table is empty
INSERT INTO affiliate_terms (content) 
SELECT ''
WHERE NOT EXISTS (SELECT 1 FROM affiliate_terms);
