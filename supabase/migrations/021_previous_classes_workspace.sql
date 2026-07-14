-- 021_previous_classes_workspace.sql
-- Phase 1 of the AI-powered Previous Class Workspace. A "lecture" is a sessions
-- row; this layer links uploaded materials to a lecture and adds the workspace
-- tables (teacher notes, personal notes, cached AI content, quiz attempts).

-- Link a material to the lecture it belongs to, cache extracted text for AI/
-- rendering, and remember which bucket it lives in (private for secure content).
ALTER TABLE course_materials
    ADD COLUMN IF NOT EXISTS session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS extracted_text TEXT,
    ADD COLUMN IF NOT EXISTS bucket         TEXT DEFAULT 'uploads';

CREATE INDEX IF NOT EXISTS idx_course_materials_session ON course_materials (session_id);

-- One collaborative teacher-notes document per lecture (teachers/admins edit).
CREATE TABLE IF NOT EXISTS lecture_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    content     TEXT        DEFAULT '',
    updated_by  UUID        REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Private per-user notes for a lecture.
CREATE TABLE IF NOT EXISTS lecture_personal_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content     TEXT        DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, user_id)
);

-- Cached AI-generated learning content (summary / takeaways / quiz) per lecture
-- and difficulty, so it's generated once and regenerated on demand.
CREATE TABLE IF NOT EXISTS lecture_ai_content (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind         TEXT        NOT NULL CHECK (kind IN ('summary', 'takeaways', 'quiz')),
    difficulty   TEXT        NOT NULL DEFAULT 'standard'
                             CHECK (difficulty IN ('easy', 'standard', 'hard')),
    payload      JSONB       NOT NULL DEFAULT '{}',
    model        TEXT,
    generated_by UUID        REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, kind, difficulty)
);

CREATE INDEX IF NOT EXISTS idx_lecture_ai_session ON lecture_ai_content (session_id);

-- Student quiz attempts against a lecture's practice quiz.
CREATE TABLE IF NOT EXISTS lecture_quiz_attempts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answers      JSONB       NOT NULL DEFAULT '{}',
    score        INTEGER     NOT NULL DEFAULT 0,
    total        INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lecture_quiz_attempts_user ON lecture_quiz_attempts (user_id, session_id);

-- Private bucket for securely-delivered lecture content (streamed via signed URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lecture-content', 'lecture-content', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE lecture_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_personal_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_ai_content      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_quiz_attempts   ENABLE ROW LEVEL SECURITY;

-- Teacher notes + AI content are readable by any authenticated user in scope
-- (writes happen server-side via the service role).
DROP POLICY IF EXISTS lecture_notes_select ON lecture_notes;
CREATE POLICY lecture_notes_select ON lecture_notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lecture_ai_select ON lecture_ai_content;
CREATE POLICY lecture_ai_select ON lecture_ai_content FOR SELECT TO authenticated USING (true);

-- Personal notes: only the owner.
DROP POLICY IF EXISTS lecture_personal_all ON lecture_personal_notes;
CREATE POLICY lecture_personal_all ON lecture_personal_notes
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Quiz attempts: owner reads their own.
DROP POLICY IF EXISTS lecture_quiz_select ON lecture_quiz_attempts;
CREATE POLICY lecture_quiz_select ON lecture_quiz_attempts
    FOR SELECT TO authenticated USING (user_id = auth.uid());
