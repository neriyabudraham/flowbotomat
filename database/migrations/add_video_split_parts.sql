-- Migration: Add video split part tracking columns to status_bot_queue
-- These columns track which part of a split video each queue item represents

DO $$ 
BEGIN
  -- Add part_group_id column - groups all parts of a split video together
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'status_bot_queue' AND column_name = 'part_group_id'
  ) THEN
    ALTER TABLE status_bot_queue ADD COLUMN part_group_id UUID;
    CREATE INDEX IF NOT EXISTS idx_status_bot_queue_part_group ON status_bot_queue(part_group_id) WHERE part_group_id IS NOT NULL;
  END IF;
  
  -- Add part_number column - which part number this is (1, 2, 3, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'status_bot_queue' AND column_name = 'part_number'
  ) THEN
    ALTER TABLE status_bot_queue ADD COLUMN part_number INTEGER;
  END IF;
  
  -- Add total_parts column - total number of parts in the group
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'status_bot_queue' AND column_name = 'total_parts'
  ) THEN
    ALTER TABLE status_bot_queue ADD COLUMN total_parts INTEGER;
  END IF;
END $$;

-- Comment on columns for documentation
COMMENT ON COLUMN status_bot_queue.part_group_id IS 'Groups all parts of a split video together';
COMMENT ON COLUMN status_bot_queue.part_number IS 'Part number in a split video (1, 2, 3, etc.)';
COMMENT ON COLUMN status_bot_queue.total_parts IS 'Total number of parts in the video split group';
