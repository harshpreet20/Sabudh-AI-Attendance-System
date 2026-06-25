-- 007_seed.sql
-- Seed data for the AI Attendance System

-- ============================================================
-- Organization: Sabudh Foundation
-- ============================================================
INSERT INTO organizations (id, name, slug, timezone)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Sabudh Foundation',
    'sabudh',
    'Asia/Kolkata'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Campus: Main Campus
-- ============================================================
INSERT INTO campuses (id, organization_id, name, city)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Main Campus',
    'Chandigarh'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Course: AI Zero to One
-- ============================================================
INSERT INTO courses (id, organization_id, title, duration_weeks, attendance_requirement)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'AI Zero to One',
    12,
    80.00
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Classrooms
-- ============================================================
INSERT INTO classrooms (id, campus_id, name, capacity)
VALUES
    (
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'Lab 1',
        50
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000001',
        'Lab 2',
        30
    )
ON CONFLICT DO NOTHING;

-- ============================================================
-- System Settings
-- ============================================================
INSERT INTO system_settings (organization_id, key, value, description)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        'attendance_window_minutes',
        '45',
        'Number of minutes the attendance window stays open after being activated'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'min_attendance_percentage',
        '80',
        'Minimum attendance percentage required to remain in good standing'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'certificate_threshold',
        '80',
        'Minimum attendance percentage required to be eligible for a certificate'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'reminder_threshold',
        '75',
        'Attendance percentage below which reminder notifications are sent'
    )
ON CONFLICT (organization_id, key) DO NOTHING;
