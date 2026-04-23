-- Track exact completion of the Phase 2 default broadcast call.
--
-- Context: in viewers-first mode the send has two phases — (1) contacts-format
-- to known viewers, (2) a single WAHA /status/{type} broadcast call. If a
-- deploy/crash happens mid-phase-2, the watchdog resets the item to pending
-- and sendStatus re-runs from the top. Phase 1 is idempotent (tracked in
-- status_bot_contact_sends), but the broadcast call is a single request with
-- no per-recipient log — so without a marker, the system would call the
-- broadcast again. Even with the same client-generated messageId, there's
-- no guarantee WAHA deduplicates every broadcast scenario identically.
--
-- broadcast_sent_at is set the moment the broadcast POST returns successfully.
-- On re-entry, sendStatus sees it's non-null and skips the broadcast step.

ALTER TABLE status_bot_queue
  ADD COLUMN IF NOT EXISTS broadcast_sent_at TIMESTAMP;
