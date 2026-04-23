-- 011: idempotency for saveContactBot webhook — unique WA message id.
-- Partial unique index so legacy NULL rows still allowed; new rows with an id
-- cannot be inserted twice (Meta retries the webhook at-least-once).

CREATE UNIQUE INDEX IF NOT EXISTS save_contact_bot_req_wa_msg_id_uniq
  ON save_contact_bot_received_requests (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
