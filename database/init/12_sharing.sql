-- FlowBotomat - Sharing & Permissions
-- Bot sharing between users

-- Permission levels enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'share_permission') THEN
        CREATE TYPE share_permission AS ENUM ('view', 'edit', 'admin');
    END IF;
END $$;

-- Bot Shares Table
CREATE TABLE IF NOT EXISTS bot_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission share_permission DEFAULT 'view',
    
    -- Optional: share with expiry
    expires_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicate shares
    UNIQUE(bot_id, shared_with_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_shares_bot ON bot_shares(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_shares_owner ON bot_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_bot_shares_shared_with ON bot_shares(shared_with_id);

-- Expert-Client relationships
-- Experts can manage their clients' bots
CREATE TABLE IF NOT EXISTS expert_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expert_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- What the expert can do
    can_view_bots BOOLEAN DEFAULT TRUE,
    can_edit_bots BOOLEAN DEFAULT TRUE,
    can_manage_contacts BOOLEAN DEFAULT TRUE,
    can_view_analytics BOOLEAN DEFAULT TRUE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP,
    
    -- Prevent duplicate relationships
    UNIQUE(expert_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_expert_clients_expert ON expert_clients(expert_id);
CREATE INDEX IF NOT EXISTS idx_expert_clients_client ON expert_clients(client_id);

-- Share invitations (for sharing via email/link)
CREATE TABLE IF NOT EXISTS share_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Invitation details
    invite_email VARCHAR(255),
    invite_token VARCHAR(100) UNIQUE,
    permission share_permission DEFAULT 'view',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected, expired
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    accepted_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_share_invitations_token ON share_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_share_invitations_email ON share_invitations(invite_email);

-- Log
DO $$
BEGIN
  RAISE NOTICE '✅ Sharing tables created successfully!';
END $$;
