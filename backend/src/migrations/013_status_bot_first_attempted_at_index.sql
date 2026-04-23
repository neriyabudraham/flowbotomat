-- 013: index on first_attempted_at to speed up the 2-hour autoretry window
-- query in queue.service.js (COALESCE(first_attempted_at, created_at) > NOW() - INTERVAL '2 hours').
-- Partial index — NULL values (not yet attempted) are not useful for the window check.

CREATE INDEX IF NOT EXISTS idx_sbq_first_attempted_at
  ON status_bot_queue (first_attempted_at)
  WHERE first_attempted_at IS NOT NULL;
