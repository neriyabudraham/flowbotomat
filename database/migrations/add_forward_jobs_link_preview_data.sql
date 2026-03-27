-- Add link_preview_data JSONB column to forward_jobs
-- Stores preview metadata (title, description, thumbnail URL) extracted from webhook
ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS link_preview_data JSONB;
