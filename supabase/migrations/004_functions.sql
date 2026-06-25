-- 004_functions.sql
-- PostgreSQL functions for the AI Attendance System

-- ============================================================
-- calculate_attendance_percentage
-- Returns the attendance percentage for a given student based
-- on approved attendance records vs total eligible sessions
-- in the student's batch.
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_attendance_percentage(p_student_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_batch_id      UUID;
    v_total         INTEGER;
    v_approved      INTEGER;
BEGIN
    -- Get the student's batch
    SELECT batch_id INTO v_batch_id
    FROM student_profiles
    WHERE id = p_student_id;

    IF v_batch_id IS NULL THEN
        RETURN 0.00;
    END IF;

    -- Count total eligible sessions (not cancelled) in the batch
    SELECT COUNT(*) INTO v_total
    FROM sessions
    WHERE batch_id = v_batch_id
      AND status NOT IN ('cancelled', 'archived');

    IF v_total = 0 THEN
        RETURN 0.00;
    END IF;

    -- Count approved attendance records for this student
    SELECT COUNT(*) INTO v_approved
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE a.student_id = p_student_id
      AND s.batch_id = v_batch_id
      AND a.status = 'approved';

    RETURN ROUND((v_approved::NUMERIC / v_total::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- check_certificate_eligibility
-- Returns TRUE if the student's attendance percentage meets or
-- exceeds the course requirement and the student is active.
-- ============================================================
CREATE OR REPLACE FUNCTION check_certificate_eligibility(p_student_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_attendance    NUMERIC;
    v_requirement   NUMERIC;
    v_status        TEXT;
BEGIN
    -- Get student status
    SELECT status INTO v_status
    FROM student_profiles
    WHERE id = p_student_id;

    IF v_status != 'active' THEN
        RETURN FALSE;
    END IF;

    -- Calculate current attendance
    v_attendance := calculate_attendance_percentage(p_student_id);

    -- Get course attendance requirement via batch -> course
    SELECT c.attendance_requirement INTO v_requirement
    FROM student_profiles sp
    JOIN batches b ON b.id = sp.batch_id
    JOIN courses c ON c.id = b.course_id
    WHERE sp.id = p_student_id;

    IF v_requirement IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_attendance >= v_requirement;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- update_student_attendance_stats
-- Trigger function: fires AFTER INSERT OR UPDATE on attendance.
-- When status changes to 'approved', recalculates attendance
-- stats on the student_profiles row.
-- ============================================================
CREATE OR REPLACE FUNCTION update_student_attendance_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_student_id    UUID;
    v_batch_id      UUID;
    v_present       INTEGER;
    v_absent        INTEGER;
    v_late          INTEGER;
    v_total         INTEGER;
    v_percentage    NUMERIC;
BEGIN
    v_student_id := NEW.student_id;

    -- Get student's batch
    SELECT batch_id INTO v_batch_id
    FROM student_profiles
    WHERE id = v_student_id;

    IF v_batch_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Total eligible sessions in the batch
    SELECT COUNT(*) INTO v_total
    FROM sessions
    WHERE batch_id = v_batch_id
      AND status NOT IN ('cancelled', 'archived');

    -- Approved (present) count
    SELECT COUNT(*) INTO v_present
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE a.student_id = v_student_id
      AND s.batch_id = v_batch_id
      AND a.status = 'approved';

    -- Rejected / absent count (sessions without approved attendance)
    v_absent := v_total - v_present;
    IF v_absent < 0 THEN
        v_absent := 0;
    END IF;

    -- Late count (excused can serve as late proxy)
    SELECT COUNT(*) INTO v_late
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE a.student_id = v_student_id
      AND s.batch_id = v_batch_id
      AND a.status = 'excused';

    -- Attendance percentage
    IF v_total > 0 THEN
        v_percentage := ROUND((v_present::NUMERIC / v_total::NUMERIC) * 100, 2);
    ELSE
        v_percentage := 0.00;
    END IF;

    -- Update student profile
    UPDATE student_profiles
    SET present_count           = v_present,
        absent_count            = v_absent,
        late_count              = v_late,
        total_sessions          = v_total,
        attendance_percentage   = v_percentage,
        updated_at              = now()
    WHERE id = v_student_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- generate_attendance_word
-- Returns a random easy-to-pronounce, distinct word from a
-- predefined list of 100 words.
-- ============================================================
CREATE OR REPLACE FUNCTION generate_attendance_word()
RETURNS TEXT AS $$
DECLARE
    words TEXT[] := ARRAY[
        'apple', 'banana', 'cherry', 'dolphin', 'eagle',
        'falcon', 'garden', 'harbor', 'island', 'jungle',
        'kitten', 'lemon', 'mango', 'nectar', 'ocean',
        'panda', 'quartz', 'rabbit', 'salmon', 'tiger',
        'umbrella', 'violet', 'walrus', 'yellow', 'zebra',
        'anchor', 'breeze', 'castle', 'desert', 'ember',
        'forest', 'glacier', 'helmet', 'indigo', 'jasmine',
        'kingdom', 'lantern', 'marble', 'nebula', 'orchid',
        'penguin', 'quiver', 'rocket', 'sunset', 'thunder',
        'unicorn', 'velvet', 'whisper', 'zenith', 'aurora',
        'beacon', 'copper', 'dazzle', 'emerald', 'feather',
        'granite', 'horizon', 'ivory', 'journey', 'kindle',
        'lotus', 'meadow', 'nimbus', 'oasis', 'prism',
        'riddle', 'silver', 'temple', 'utopia', 'vertex',
        'willow', 'blizzard', 'canvas', 'crystal', 'diamond',
        'eclipse', 'flicker', 'golden', 'harvest', 'iceberg',
        'jubilee', 'keynote', 'liberty', 'monsoon', 'nitro',
        'olympus', 'phantom', 'ripple', 'scarlet', 'tornado',
        'upward', 'venture', 'wonder', 'blossom', 'crimson',
        'drizzle', 'enigma', 'firefly', 'garnet', 'humble'
    ];
BEGIN
    RETURN words[1 + floor(random() * array_length(words, 1))::INTEGER];
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================
-- create_audit_log
-- Convenience function to insert a row into audit_logs.
-- ============================================================
CREATE OR REPLACE FUNCTION create_audit_log(
    p_actor_id      UUID,
    p_action        TEXT,
    p_target_table  TEXT,
    p_target_id     UUID,
    p_old_value     JSONB DEFAULT NULL,
    p_new_value     JSONB DEFAULT NULL,
    p_reason        TEXT  DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO audit_logs (actor_id, action, target_table, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_action, p_target_table, p_target_id, p_old_value, p_new_value, p_reason)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- update_updated_at
-- Generic trigger function that sets updated_at = now() on
-- any UPDATE operation.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
