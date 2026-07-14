-- 024_whiteboards.sql
-- Phase 4: collaborative lecture whiteboard with realtime sync + replay.
-- whiteboards      : one board per lecture (session).
-- whiteboard_elements : current board state (sticky/rect/ellipse/text/path).
-- whiteboard_events   : append-only op log powering replay.

CREATE TABLE IF NOT EXISTS whiteboards (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    title       TEXT        DEFAULT 'Lecture whiteboard',
    created_by  UUID        REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whiteboard_elements (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID        NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL CHECK (kind IN ('sticky', 'rect', 'ellipse', 'text', 'path', 'connector')),
    data        JSONB       NOT NULL DEFAULT '{}',
    z           INTEGER     DEFAULT 0,
    deleted     BOOLEAN     DEFAULT false,
    updated_by  UUID        REFERENCES auth.users(id),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wb_elements_board ON whiteboard_elements (board_id) WHERE deleted = false;

CREATE TABLE IF NOT EXISTS whiteboard_events (
    id          BIGSERIAL   PRIMARY KEY,
    board_id    UUID        NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    op          TEXT        NOT NULL CHECK (op IN ('add', 'update', 'delete', 'clear')),
    element_id  UUID,
    data        JSONB       DEFAULT '{}',
    actor       UUID        REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wb_events_board ON whiteboard_events (board_id, id);

ALTER TABLE whiteboards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_elements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_events    ENABLE ROW LEVEL SECURITY;

-- Reads are open to authenticated users (lecture-scoping enforced in the API);
-- all writes flow through the service role in the API.
DROP POLICY IF EXISTS wb_select ON whiteboards;
CREATE POLICY wb_select ON whiteboards FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wb_el_select ON whiteboard_elements;
CREATE POLICY wb_el_select ON whiteboard_elements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wb_ev_select ON whiteboard_events;
CREATE POLICY wb_ev_select ON whiteboard_events FOR SELECT TO authenticated USING (true);
