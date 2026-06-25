-- 002_core_tables.sql
-- Core schema for the AI Attendance & Student Management Platform

-- ============================================================
-- organizations
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        UNIQUE NOT NULL,
    timezone    TEXT        DEFAULT 'Asia/Kolkata',
    logo_url    TEXT,
    settings    JSONB       DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- campuses
-- ============================================================
CREATE TABLE IF NOT EXISTS campuses (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    name            TEXT        NOT NULL,
    address         TEXT,
    city            TEXT,
    status          TEXT        DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID        NOT NULL REFERENCES organizations(id),
    title                   TEXT        NOT NULL,
    description             TEXT,
    duration_weeks          INTEGER,
    attendance_requirement  NUMERIC(5,2) DEFAULT 80.00,
    status                  TEXT        DEFAULT 'active'
                                        CHECK (status IN ('active', 'archived')),
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- classrooms
-- ============================================================
CREATE TABLE IF NOT EXISTS classrooms (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id   UUID        NOT NULL REFERENCES campuses(id),
    name        TEXT        NOT NULL,
    building    TEXT,
    floor       TEXT,
    capacity    INTEGER,
    status      TEXT        DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- classroom_images
-- ============================================================
CREATE TABLE IF NOT EXISTS classroom_images (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id  UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    image_type    TEXT        NOT NULL
                              CHECK (image_type IN (
                                  'front', 'back', 'whiteboard', 'projector',
                                  'computer_lab', 'entrance', 'other'
                              )),
    storage_path  TEXT        NOT NULL,
    uploaded_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- batches
-- ============================================================
CREATE TABLE IF NOT EXISTS batches (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID        NOT NULL REFERENCES courses(id),
    name            TEXT        NOT NULL,
    instructor_id   UUID        REFERENCES auth.users(id),
    start_date      DATE,
    end_date        DATE,
    status          TEXT        DEFAULT 'active'
                                CHECK (status IN ('active', 'completed', 'archived')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- user_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id),
    role            TEXT        NOT NULL
                                CHECK (role IN ('student', 'instructor', 'admin', 'super_admin')),
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, role, organization_id)
);

-- ============================================================
-- student_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS student_profiles (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id            UUID        UNIQUE NOT NULL REFERENCES auth.users(id),
    organization_id         UUID        NOT NULL REFERENCES organizations(id),
    batch_id                UUID        REFERENCES batches(id),
    full_name               TEXT        NOT NULL,
    email                   CITEXT      NOT NULL,
    phone                   TEXT,
    date_of_birth           DATE,
    gender                  TEXT        CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    profession              TEXT,
    organization_name       TEXT,
    qualification           TEXT,
    city                    TEXT,
    emergency_contact       TEXT,
    learning_goal           TEXT,
    preferred_language      TEXT        DEFAULT 'en',
    profile_image_url       TEXT,
    status                  TEXT        DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'active', 'suspended', 'expelled', 'archived')),
    attendance_percentage   NUMERIC(5,2) DEFAULT 0.00,
    present_count           INTEGER     DEFAULT 0,
    absent_count            INTEGER     DEFAULT 0,
    late_count              INTEGER     DEFAULT 0,
    total_sessions          INTEGER     DEFAULT 0,
    ai_persona              TEXT,
    risk_score              NUMERIC(5,2) DEFAULT 0.00,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- enrollment_images
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollment_images (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID        NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    storage_path  TEXT        NOT NULL,
    angle         TEXT        CHECK (angle IN ('front', 'left', 'right', 'up', 'down')),
    uploaded_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id          UUID        NOT NULL REFERENCES batches(id),
    classroom_id      UUID        REFERENCES classrooms(id),
    instructor_id     UUID        REFERENCES auth.users(id),
    session_date      DATE        NOT NULL,
    attendance_open   TIMESTAMPTZ,
    attendance_close  TIMESTAMPTZ,
    attendance_word   TEXT,
    status            TEXT        DEFAULT 'scheduled'
                                  CHECK (status IN (
                                      'scheduled', 'attendance_open', 'attendance_closed',
                                      'completed', 'cancelled', 'archived'
                                  )),
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID        NOT NULL REFERENCES sessions(id),
    student_id          UUID        NOT NULL REFERENCES student_profiles(id),
    status              TEXT        DEFAULT 'draft'
                                    CHECK (status IN (
                                        'draft', 'uploaded', 'processing', 'approved',
                                        'rejected', 'manual_review', 'excused'
                                    )),
    submitted_at        TIMESTAMPTZ,
    verified_at         TIMESTAMPTZ,
    decision            TEXT        CHECK (decision IN ('accepted', 'rejected', 'manual_review', 'pending')),
    decision_reason     TEXT,
    reviewed_by         UUID        REFERENCES auth.users(id),
    reviewed_at         TIMESTAMPTZ,
    device_fingerprint  TEXT,
    browser             TEXT,
    operating_system    TEXT,
    ip_address          INET,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, student_id)
);

-- ============================================================
-- attendance_media
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_media (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id     UUID        NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    selfie_path       TEXT,
    video_path        TEXT,
    audio_path        TEXT,
    selfie_hash       TEXT,
    video_hash        TEXT,
    audio_hash        TEXT,
    media_size_bytes  BIGINT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- attendance_scores
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_scores (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id       UUID        UNIQUE NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    speech_score        NUMERIC(5,2),
    face_score          NUMERIC(5,2),
    classroom_score     NUMERIC(5,2),
    liveness_score      NUMERIC(5,2),
    fraud_score         NUMERIC(5,2),
    overall_confidence  NUMERIC(5,2),
    model_version       TEXT,
    processing_time_ms  INTEGER,
    reason_codes        TEXT[],
    provider            TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- student_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS student_devices (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID        NOT NULL REFERENCES student_profiles(id),
    fingerprint         TEXT        NOT NULL,
    browser             TEXT,
    operating_system    TEXT,
    screen_resolution   TEXT,
    timezone            TEXT,
    language            TEXT,
    first_seen          TIMESTAMPTZ DEFAULT now(),
    last_seen           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id),
    type        TEXT        NOT NULL
                            CHECK (type IN (
                                'attendance_accepted', 'attendance_rejected',
                                'attendance_reminder', 'low_attendance',
                                'certificate_eligible', 'account_suspended',
                                'account_restored', 'system', 'info'
                            )),
    title       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    metadata    JSONB       DEFAULT '{}',
    read_at     TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- instructor_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS instructor_notes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID        NOT NULL REFERENCES student_profiles(id),
    instructor_id   UUID        NOT NULL REFERENCES auth.users(id),
    note            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- certificates
-- ============================================================
CREATE TABLE IF NOT EXISTS certificates (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id              UUID        NOT NULL REFERENCES student_profiles(id),
    course_id               UUID        NOT NULL REFERENCES courses(id),
    attendance_percentage   NUMERIC(5,2) NOT NULL,
    issued_at               TIMESTAMPTZ DEFAULT now(),
    verification_token      UUID        UNIQUE DEFAULT gen_random_uuid(),
    qr_code_url             TEXT,
    status                  TEXT        DEFAULT 'active'
                                        CHECK (status IN ('active', 'revoked')),
    revoked_at              TIMESTAMPTZ,
    revoked_reason          TEXT,
    created_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- audit_logs  (append-only: no UPDATE or DELETE)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID        REFERENCES auth.users(id),
    action          TEXT        NOT NULL,
    target_table    TEXT,
    target_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    reason          TEXT,
    ip_address      INET,
    user_agent      TEXT,
    correlation_id  UUID        DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Prevent UPDATE and DELETE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: % operations are not allowed', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();

-- ============================================================
-- system_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id),
    key             TEXT        NOT NULL,
    value           JSONB       NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, key)
);
