-- Broadcast Admin Configuration
-- Migration: add_broadcast_admin.sql
-- Allows account owners to configure a single "broadcast admin" who:
-- 1. Approves/rejects group broadcast requests via WhatsApp
-- 2. Can cascade-delete broadcast messages from all groups by deleting from one

-- ============================================
-- Broadcast Admin Config (one per user/account)
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_admin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Admin's WhatsApp phone number (e.g., "972501234567")
  admin_phone VARCHAR(30) NOT NULL,

  -- Display name for the admin
  admin_name VARCHAR(255),

  -- Whether approval is required before sending group broadcasts
  require_approval BOOLEAN DEFAULT true,

  -- Delay in seconds between deleting messages from each group (default 2s)
  delete_delay_seconds INT DEFAULT 2,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Only one admin config per user
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_admin_config_user ON broadcast_admin_config(user_id);

-- ============================================
-- Track pending admin approval requests
-- ============================================
CREATE TABLE IF NOT EXISTS broadcast_admin_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The forward job waiting for approval
  job_id UUID NOT NULL REFERENCES forward_jobs(id) ON DELETE CASCADE,

  -- Who requested the broadcast
  sender_phone VARCHAR(30) NOT NULL,
  sender_name VARCHAR(255),

  -- Status: pending, approved, rejected
  status VARCHAR(20) DEFAULT 'pending',

  -- When it was approved/rejected
  resolved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_admin_approvals_user ON broadcast_admin_approvals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_admin_approvals_job ON broadcast_admin_approvals(job_id);

-- ============================================
-- Add status for pending admin approval to forward_jobs
-- Add a column to track if job is waiting for admin approval
-- ============================================
ALTER TABLE forward_jobs
  ADD COLUMN IF NOT EXISTS awaiting_admin_approval BOOLEAN DEFAULT false;

SELECT 'Broadcast admin tables created!' as status;
