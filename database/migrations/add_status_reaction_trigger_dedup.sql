-- Dedup table for the `status_reaction` trigger.
-- Each (user, reactor_phone, status) pair fires the trigger at most once,
-- regardless of how many times the contact toggles the heart.

CREATE TABLE IF NOT EXISTS status_reaction_trigger_log (
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reactor_phone        VARCHAR(20) NOT NULL,
  status_hex_id        VARCHAR(64) NOT NULL,
  triggered_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, reactor_phone, status_hex_id)
);

CREATE INDEX IF NOT EXISTS idx_srtl_user_reactor
  ON status_reaction_trigger_log (user_id, reactor_phone);
