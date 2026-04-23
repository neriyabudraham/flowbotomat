-- Widen VARCHAR columns across status_bot_* tables.
--
-- WAHA message IDs for status broadcasts can exceed 100 chars (include device
-- suffix + broadcast marker + sender phone). WhatsApp display names can contain
-- long emoji-heavy strings that push past 100 chars. Previously the INSERT
-- failed with "value too long for type character varying(100)" — marking the
-- queue item as failed even though the send itself succeeded at the WAHA side.
--
-- Widening to VARCHAR(500) / VARCHAR(255) removes the hard limits without any
-- data migration risk (all existing values fit).

-- Message IDs — WAHA returns longer IDs for certain status types
ALTER TABLE status_bot_statuses ALTER COLUMN waha_message_id TYPE VARCHAR(500);
ALTER TABLE status_bot_queue ALTER COLUMN status_message_id TYPE VARCHAR(500);
ALTER TABLE status_bot_queue ALTER COLUMN source_message_id TYPE VARCHAR(500);

-- Display names from WhatsApp (viewers/reactors/repliers/users) — can be long
ALTER TABLE status_bot_views ALTER COLUMN viewer_name TYPE VARCHAR(255);
ALTER TABLE status_bot_reactions ALTER COLUMN reactor_name TYPE VARCHAR(255);
ALTER TABLE status_bot_replies ALTER COLUMN replier_name TYPE VARCHAR(255);
ALTER TABLE status_bot_connections ALTER COLUMN display_name TYPE VARCHAR(255);
ALTER TABLE status_bot_authorized_numbers ALTER COLUMN name TYPE VARCHAR(255);

-- Phone identifier columns — @lid addresses can be longer than regular phones
ALTER TABLE status_bot_queue ALTER COLUMN source_phone TYPE VARCHAR(100);
ALTER TABLE status_bot_statuses ALTER COLUMN source_phone TYPE VARCHAR(100);
