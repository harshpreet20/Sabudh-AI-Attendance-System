-- 003_indexes.sql
-- Performance indexes for the AI Attendance System

-- student_profiles
CREATE INDEX IF NOT EXISTS idx_student_profiles_auth_user_id
    ON student_profiles (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_student_profiles_email
    ON student_profiles (email);

CREATE INDEX IF NOT EXISTS idx_student_profiles_phone
    ON student_profiles (phone);

CREATE INDEX IF NOT EXISTS idx_student_profiles_status
    ON student_profiles (status);

CREATE INDEX IF NOT EXISTS idx_student_profiles_batch_id
    ON student_profiles (batch_id);

CREATE INDEX IF NOT EXISTS idx_student_profiles_organization_id
    ON student_profiles (organization_id);

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_session_id
    ON attendance (session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id
    ON attendance (student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_status
    ON attendance (status);

CREATE INDEX IF NOT EXISTS idx_attendance_submitted_at
    ON attendance (submitted_at);

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_session_date
    ON sessions (session_date);

CREATE INDEX IF NOT EXISTS idx_sessions_batch_id
    ON sessions (batch_id);

CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON sessions (status);

CREATE INDEX IF NOT EXISTS idx_sessions_attendance_open
    ON sessions (attendance_open);

CREATE INDEX IF NOT EXISTS idx_sessions_attendance_close
    ON sessions (attendance_close);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read_at
    ON notifications (read_at);

CREATE INDEX IF NOT EXISTS idx_notifications_type
    ON notifications (type);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id
    ON audit_logs (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_table
    ON audit_logs (target_table);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at);

-- certificates
CREATE INDEX IF NOT EXISTS idx_certificates_student_id
    ON certificates (student_id);

CREATE INDEX IF NOT EXISTS idx_certificates_verification_token
    ON certificates (verification_token);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
    ON user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role
    ON user_roles (role);
