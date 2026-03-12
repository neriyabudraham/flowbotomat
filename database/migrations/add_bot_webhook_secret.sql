-- Add webhook_secret to bots for external webhook trigger support
ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_webhook_secret
  ON bots(webhook_secret) WHERE webhook_secret IS NOT NULL;

SELECT 'bots.webhook_secret added!' as status;
