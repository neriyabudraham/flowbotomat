-- 012: heartbeat column on google contacts deletion log.
-- Lets us detect stuck/stale jobs (no progress for N minutes → mark error).

ALTER TABLE google_contacts_deletion_log
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_gcdl_running_updated
  ON google_contacts_deletion_log (status, updated_at)
  WHERE status = 'running';
