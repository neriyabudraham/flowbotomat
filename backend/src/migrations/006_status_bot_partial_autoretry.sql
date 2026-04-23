-- Auto-retry infrastructure for partially-sent status bot items.
--
-- Instead of giving up on a partial send, the system now:
--   • reschedules itself with increasing delays (2, 3, 4, ... min)
--   • after 20 minutes, flips `partial_abandoned = true` — this stops it from
--     blocking next queued items for the same user, but retries continue in
--     background
--   • after 2 hours from first_attempted_at, gives up for good and marks failed
--
-- `first_attempted_at` is set ONCE when the item first starts processing and
-- never overwritten — serves as the anchor for the 2-hour deadline.
-- `partial_abandoned` flags items whose 20-min grace has elapsed so they don't
-- hold up the rest of the user's queue.

ALTER TABLE status_bot_queue
  ADD COLUMN IF NOT EXISTS first_attempted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS partial_abandoned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_alerted_20min BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sbq_partial_retry
  ON status_bot_queue(scheduled_for)
  WHERE queue_status = 'pending' AND retry_count > 0;
