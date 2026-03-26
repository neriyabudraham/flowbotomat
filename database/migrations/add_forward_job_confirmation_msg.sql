-- Add confirmation_msg_id to forward_jobs
-- Stores the WhatsApp message ID of the confirmation message sent to the sender
-- Used to link text replies ("שלח"/"בטל") to specific jobs via quoted message context
ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS confirmation_msg_id VARCHAR(255);
