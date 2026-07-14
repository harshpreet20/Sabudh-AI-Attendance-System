-- 014_feature_enhancements.sql
-- Schema for the feature enhancement suite:
--   1. QR Backup Mode
--   4/9. Push notifications + at-risk dashboards
--   5. Attendance Risk Detection
--   6. Smart Duplicate Detection
--   7. Bulk Upload (faculty / subjects)
--   8. Offline Attendance Mode
--
-- All statements are idempotent so the file can be re-run safely.

-- ============================================================
-- attendance: capture method + offline sync + QR linkage
-- ============================================================
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS method            TEXT DEFAULT 'selfie'
        CHECK (method IN ('selfie', 'qr', 'manual', 'offline')),
    ADD COLUMN IF NOT EXISTS qr_token_id       UUID,
    ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS client_dedup_key  TEXT;

-- Guard against the same offline capture syncing twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_client_dedup
    ON attendance (student_id, client_dedup_key)
    WHERE client_dedup_key IS NOT NULL;

-- ============================================================
-- attendance_qr_tokens  (QR Backup Mode)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_qr_tokens (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    token         TEXT        UNIQUE NOT NULL,
    created_by    UUID        REFERENCES auth.users(id),
    expires_at    TIMESTAMPTZ NOT NULL,
    max_uses      INTEGER,
    use_count     INTEGER     DEFAULT 0,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_session ON attendance_qr_tokens (session_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token   ON attendance_qr_tokens (token);

ALTER TABLE attendance
    DROP CONSTRAINT IF EXISTS attendance_qr_token_fk;
ALTER TABLE attendance
    ADD CONSTRAINT attendance_qr_token_fk
    FOREIGN KEY (qr_token_id) REFERENCES attendance_qr_tokens(id) ON DELETE SET NULL;

-- ============================================================
-- attendance_flags  (Smart Duplicate Detection review queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_flags (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id  UUID        REFERENCES attendance(id) ON DELETE CASCADE,
    student_id     UUID        NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    session_id     UUID        REFERENCES sessions(id) ON DELETE CASCADE,
    flag_type      TEXT        NOT NULL
                               CHECK (flag_type IN (
                                   'multiple_devices', 'duplicate_device',
                                   'location_change', 'multiple_locations',
                                   'duplicate_session', 'suspicious_accuracy',
                                   'ip_mismatch', 'rapid_resubmission', 'other'
                               )),
    severity       TEXT        DEFAULT 'medium'
                               CHECK (severity IN ('low', 'medium', 'high')),
    details        JSONB       DEFAULT '{}',
    status         TEXT        DEFAULT 'open'
                               CHECK (status IN ('open', 'reviewed', 'dismissed', 'confirmed')),
    reviewed_by    UUID        REFERENCES auth.users(id),
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_flags_status  ON attendance_flags (status);
CREATE INDEX IF NOT EXISTS idx_attendance_flags_student ON attendance_flags (student_id);

-- ============================================================
-- risk_assessments  (Attendance Risk Detection snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_assessments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID        NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    batch_id            UUID        REFERENCES batches(id) ON DELETE CASCADE,
    risk_level          TEXT        NOT NULL
                                    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    projected_pct       NUMERIC(5,2),
    threshold_pct       NUMERIC(5,2),
    consecutive_absences INTEGER    DEFAULT 0,
    factors             JSONB       DEFAULT '[]',
    recommendation      TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_student ON risk_assessments (student_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_level   ON risk_assessments (risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_created ON risk_assessments (created_at DESC);

-- ============================================================
-- push_subscriptions  (Instant Push Notifications - Web Push)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint    TEXT        UNIQUE NOT NULL,
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- ============================================================
-- notifications: widen the allowed type set
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'attendance_accepted', 'attendance_rejected', 'attendance_marked',
        'attendance_absent', 'attendance_reminder', 'attendance_window_open',
        'low_attendance', 'certificate_eligible', 'account_suspended',
        'account_restored', 'class_cancelled', 'schedule_updated',
        'correction_approved', 'correction_rejected', 'system', 'info'
    ));

-- ============================================================
-- subjects  (Bulk Upload target; lightweight academic subject)
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    course_id       UUID        REFERENCES courses(id) ON DELETE SET NULL,
    code            TEXT,
    name            TEXT        NOT NULL,
    description     TEXT,
    credits         INTEGER,
    faculty_id      UUID        REFERENCES auth.users(id),
    status          TEXT        DEFAULT 'active'
                                CHECK (status IN ('active', 'archived')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_org ON subjects (organization_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE attendance_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects             ENABLE ROW LEVEL SECURITY;

-- QR tokens: any authenticated user may read active tokens (needed to scan);
-- writes are performed server-side with the service role, which bypasses RLS.
DROP POLICY IF EXISTS qr_tokens_select ON attendance_qr_tokens;
CREATE POLICY qr_tokens_select ON attendance_qr_tokens
    FOR SELECT TO authenticated USING (true);

-- Push subscriptions: users manage only their own.
DROP POLICY IF EXISTS push_subscriptions_all ON push_subscriptions;
CREATE POLICY push_subscriptions_all ON push_subscriptions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Subjects: readable by any authenticated user in scope.
DROP POLICY IF EXISTS subjects_select ON subjects;
CREATE POLICY subjects_select ON subjects
    FOR SELECT TO authenticated USING (true);

-- Flags & risk assessments are admin/instructor surfaces written by the
-- service role; expose read access to authenticated staff via the app layer.
DROP POLICY IF EXISTS attendance_flags_select ON attendance_flags;
CREATE POLICY attendance_flags_select ON attendance_flags
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS risk_assessments_select ON risk_assessments;
CREATE POLICY risk_assessments_select ON risk_assessments
    FOR SELECT TO authenticated USING (true);
