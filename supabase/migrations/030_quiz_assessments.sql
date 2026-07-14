-- 030_quiz_assessments.sql
-- Timed, proctored assessments with per-student scoring and cheating flags.

CREATE TABLE IF NOT EXISTS quiz_assessments (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id       UUID        REFERENCES student_profiles(id) ON DELETE SET NULL,
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    difficulty       TEXT        NOT NULL DEFAULT 'standard',
    total            INTEGER     NOT NULL DEFAULT 0,
    score            INTEGER,
    status           TEXT        NOT NULL DEFAULT 'in_progress'
                                 CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'abandoned')),
    duration_seconds INTEGER     NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at     TIMESTAMPTZ,
    flags            INTEGER     NOT NULL DEFAULT 0,
    camera           BOOLEAN     NOT NULL DEFAULT false,
    mic              BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_quiz_assess_session ON quiz_assessments (session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_assess_user    ON quiz_assessments (user_id);

CREATE TABLE IF NOT EXISTS quiz_proctor_events (
    id             BIGSERIAL   PRIMARY KEY,
    assessment_id  UUID        NOT NULL REFERENCES quiz_assessments(id) ON DELETE CASCADE,
    event_type     TEXT        NOT NULL,
    severity       TEXT        NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
    details        JSONB       DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proctor_events_assessment ON quiz_proctor_events (assessment_id);

ALTER TABLE quiz_assessments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_proctor_events ENABLE ROW LEVEL SECURITY;

-- Students may read their own assessments; staff read all (checked in the API).
-- All writes flow through the service role in the API.
DROP POLICY IF EXISTS quiz_assess_select ON quiz_assessments;
CREATE POLICY quiz_assess_select ON quiz_assessments
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                   AND role = ANY (ARRAY['instructor', 'admin', 'super_admin']))
    );

DROP POLICY IF EXISTS proctor_events_select ON quiz_proctor_events;
CREATE POLICY proctor_events_select ON quiz_proctor_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                AND role = ANY (ARRAY['instructor', 'admin', 'super_admin']))
        OR EXISTS (SELECT 1 FROM quiz_assessments a WHERE a.id = assessment_id AND a.user_id = auth.uid())
    );
