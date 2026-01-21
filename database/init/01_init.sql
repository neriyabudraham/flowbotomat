-- FlowBotomat Database Initialization
-- This file runs automatically when the database container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE user_role AS ENUM ('user', 'expert', 'admin', 'superadmin');
CREATE TYPE verification_type AS ENUM ('email_verify', 'password_reset');
CREATE TYPE permission_level AS ENUM ('view', 'edit', 'manage');
CREATE TYPE instance_status AS ENUM ('disconnected', 'connecting', 'scan_qr', 'connected', 'error');
CREATE TYPE flow_status AS ENUM ('draft', 'published', 'disabled');
CREATE TYPE trigger_type AS ENUM (
  'any_message', 'exact_match', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'regex', 'new_contact',
  'tag_added', 'tag_removed', 'contact_deleted',
  'bot_resumed', 'agent_mode_started', 'agent_mode_ended'
);
CREATE TYPE bot_status AS ENUM ('active', 'paused', 'agent');
CREATE TYPE field_type AS ENUM ('text', 'number', 'date', 'boolean', 'email', 'phone', 'url');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_source AS ENUM ('user', 'bot', 'agent');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'list', 'button_response');
CREATE TYPE billing_period AS ENUM ('monthly', 'yearly', 'lifetime');
CREATE TYPE template_type AS ENUM ('system', 'community');
CREATE TYPE error_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE exit_reason AS ENUM ('completed', 'timeout', 'error', 'manual_stop', 'new_trigger');
CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error', 'update');
CREATE TYPE tag_added_by AS ENUM ('manual', 'flow', 'import');

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE '✅ FlowBotomat database initialized successfully!';
END $$;
