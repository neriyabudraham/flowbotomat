-- Audit trail for Google OAuth attempts.
-- Immune to docker logs vanishing on container rebuild — every auth-url request
-- and every callback (including failures) is persisted in Postgres.
CREATE TABLE IF NOT EXISTS google_oauth_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,  -- auth_url_requested | callback_success | callback_error
  from_path VARCHAR(50),            -- onboarding | status-bot | view-filter | null
  error_code VARCHAR(100),
  error_description TEXT,
  account_email VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_audit_user ON google_oauth_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_audit_created ON google_oauth_audit(created_at DESC);
