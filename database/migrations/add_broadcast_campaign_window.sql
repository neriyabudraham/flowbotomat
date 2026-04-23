-- Broadcast campaigns: window-aware scheduling
--
-- New capability: a campaign can throttle sends to a configurable window
-- (active_days + active_hours + timezone) with a batch-size + delay cadence.
-- When the configured batch delay pushes the next send outside the window,
-- we persist `next_batch_at` at the next-window-start and let the tick pick
-- it up. Survives restarts.
--
-- Settings keys added inside `broadcast_campaigns.settings` JSONB (no DDL for them):
--   batch_size                 - recipients per batch
--   batch_delay_minutes        - wait between batches
--   active_days                - [0..6] (0=Sun ... 6=Sat); null/empty = all days
--   active_hours               - { start: "HH:MM", end: "HH:MM" }; null = 24/7
--   timezone                   - IANA tz (default Asia/Jerusalem)
--   allow_resume               - when user stops, can the campaign be resumed?

ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS next_batch_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_batch_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paused_by_user BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stopped_by_user BOOLEAN DEFAULT FALSE;

-- Index so the tick query is cheap
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_next_batch
  ON broadcast_campaigns(next_batch_at)
  WHERE status = 'running';
