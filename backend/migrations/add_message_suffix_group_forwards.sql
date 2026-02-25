-- Add message suffix columns for group forwards
-- Global suffix on forward level, per-group suffix on target level

-- Add default message suffix to group_forwards
ALTER TABLE group_forwards 
ADD COLUMN IF NOT EXISTS message_suffix TEXT DEFAULT NULL;

-- Add custom suffix per target group (overrides default)
-- NULL = use default, empty string = no suffix, other = custom suffix
ALTER TABLE group_forward_targets 
ADD COLUMN IF NOT EXISTS custom_suffix TEXT DEFAULT NULL;

-- Add a boolean to enable/disable suffix
ALTER TABLE group_forwards 
ADD COLUMN IF NOT EXISTS suffix_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN group_forwards.message_suffix IS 'Default message suffix to append to all forwarded messages';
COMMENT ON COLUMN group_forwards.suffix_enabled IS 'Whether to append suffix to messages';
COMMENT ON COLUMN group_forward_targets.custom_suffix IS 'Custom suffix for this specific group. NULL=use default, empty=no suffix';
