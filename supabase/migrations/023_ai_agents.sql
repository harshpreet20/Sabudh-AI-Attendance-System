-- 023_ai_agents.sql
-- Phase 3: multi-agent AI orchestration. Per-lecture AI conversations where an
-- orchestrator delegates to specialised agents and merges their outputs.

CREATE TABLE IF NOT EXISTS ai_agent_conversations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT        DEFAULT 'New chat',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_session_user ON ai_agent_conversations (session_id, user_id);

CREATE TABLE IF NOT EXISTS ai_agent_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES ai_agent_conversations(id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL DEFAULT '',
    -- plan + per-agent outputs for assistant turns
    metadata        JSONB       DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conversation ON ai_agent_messages (conversation_id, created_at);

ALTER TABLE ai_agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_messages      ENABLE ROW LEVEL SECURITY;

-- Owner-only read of conversations; all writes/reads flow through the API using
-- the service role, so messages need no client policy.
DROP POLICY IF EXISTS ai_conv_owner ON ai_agent_conversations;
CREATE POLICY ai_conv_owner ON ai_agent_conversations
    FOR SELECT TO authenticated USING (user_id = auth.uid());
