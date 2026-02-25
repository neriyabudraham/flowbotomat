-- Create pending_reschedules table for storing temporary reschedule data
CREATE TABLE IF NOT EXISTS pending_reschedules (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_id INTEGER NOT NULL REFERENCES scheduled_forwards(id) ON DELETE CASCADE,
    selected_date DATE NOT NULL,
    sender_phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, scheduled_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_reschedules_user ON pending_reschedules(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_reschedules_scheduled ON pending_reschedules(scheduled_id);
