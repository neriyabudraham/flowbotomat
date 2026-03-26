-- Add link_preview column to group_forwards (default true)
ALTER TABLE group_forwards ADD COLUMN IF NOT EXISTS link_preview BOOLEAN DEFAULT true;
