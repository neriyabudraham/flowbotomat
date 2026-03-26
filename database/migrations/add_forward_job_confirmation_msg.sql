-- Add confirmation_msg_id to forward_jobs
-- Stores the WhatsApp message ID of the confirmation message sent to the sender
-- Used to link text replies ("שלח"/"בטל") to specific jobs via quoted message context
ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS confirmation_msg_id VARCHAR(255);

-- Add trigger_msg_id to forward_jobs
-- Stores the WhatsApp message ID of the original message that triggered the job
-- Used to reply-to the original message when sending confirmation lists
ALTER TABLE forward_jobs ADD COLUMN IF NOT EXISTS trigger_msg_id VARCHAR(255);
