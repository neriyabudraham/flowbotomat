-- Allow admin to manually cancel auto-retries on a partial/failed status.
-- When retry_cancelled = TRUE:
--   • the watchdog skips re-queueing the item
--   • processItem's auto-retry path bails out and marks it 'sent' (partial)
--   • the per-connection queue block ignores it (next statuses proceed)
-- The flag is reversible — admin can clear it later to resume auto-retries.

ALTER TABLE status_bot_queue
  ADD COLUMN IF NOT EXISTS retry_cancelled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retry_cancelled_at TIMESTAMP;
