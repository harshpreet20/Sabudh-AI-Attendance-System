-- 031_slide_progress.sql
-- Per-student slide-view tracking for the pre-class material, powering the
-- "% of topics covered" progress bar. `viewed` holds the distinct slide indices
-- a student has actually looked at; coverage = cardinality(viewed) / total.

CREATE TABLE IF NOT EXISTS material_slide_progress (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID        NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    session_id  UUID        REFERENCES sessions(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id  UUID        REFERENCES student_profiles(id) ON DELETE SET NULL,
    viewed      INTEGER[]   NOT NULL DEFAULT '{}',
    total       INTEGER     NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (material_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_slide_progress_session_user ON material_slide_progress (session_id, user_id);

ALTER TABLE material_slide_progress ENABLE ROW LEVEL SECURITY;

-- Students see/track their own; staff can read all (checked in the API). Writes
-- flow through the service role.
DROP POLICY IF EXISTS slide_progress_select ON material_slide_progress;
CREATE POLICY slide_progress_select ON material_slide_progress
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                   AND role = ANY (ARRAY['instructor', 'admin', 'super_admin']))
    );
