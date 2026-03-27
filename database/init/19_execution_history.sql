-- Bot execution runs - one per complete bot execution
CREATE TABLE IF NOT EXISTS bot_execution_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trigger_node_id VARCHAR(255),
  trigger_message TEXT,
  status VARCHAR(20) DEFAULT 'running', -- running, completed, error, timeout
  error_message TEXT,
  flow_snapshot JSONB, -- snapshot of flow_data at execution time
  variables_snapshot JSONB DEFAULT '{}', -- contact variables at start
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_bot_id ON bot_execution_runs(bot_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_contact_id ON bot_execution_runs(contact_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_started_at ON bot_execution_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_runs_status ON bot_execution_runs(status);

-- Bot execution steps - one per node executed within a run
CREATE TABLE IF NOT EXISTS bot_execution_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES bot_execution_runs(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_label TEXT, -- human-readable label for the node
  step_order INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'running', -- running, completed, error, skipped, waiting
  input_data JSONB DEFAULT '{}', -- what went into this node
  output_data JSONB DEFAULT '{}', -- what came out (variables set, messages sent, etc.)
  error_message TEXT,
  next_handle VARCHAR(255), -- which handle/path was taken
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_run_id ON bot_execution_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_node_id ON bot_execution_steps(node_id);

SELECT 'Execution history tables created!' as status;
