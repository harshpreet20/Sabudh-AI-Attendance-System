-- 006_rls.sql
-- Row Level Security policies for the AI Attendance System

-- ============================================================
-- Helper function: is_admin()
-- Returns TRUE if the current authenticated user has an 'admin'
-- or 'super_admin' role in any organization.
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Overload: check admin status for a specific organization
CREATE OR REPLACE FUNCTION is_admin(p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
          AND organization_id = p_organization_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- Enable RLS on ALL tables
-- ============================================================
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_media   ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- student_profiles policies
-- ============================================================

-- Students can view their own profile
CREATE POLICY student_profiles_select_own ON student_profiles
    FOR SELECT
    USING (auth_user_id = auth.uid());

-- Admins can view all profiles in their organization
CREATE POLICY student_profiles_select_admin ON student_profiles
    FOR SELECT
    USING (is_admin(organization_id));

-- Admins can insert profiles in their organization
CREATE POLICY student_profiles_insert_admin ON student_profiles
    FOR INSERT
    WITH CHECK (is_admin(organization_id));

-- Admins can update profiles in their organization
CREATE POLICY student_profiles_update_admin ON student_profiles
    FOR UPDATE
    USING (is_admin(organization_id))
    WITH CHECK (is_admin(organization_id));

-- Admins can delete profiles in their organization
CREATE POLICY student_profiles_delete_admin ON student_profiles
    FOR DELETE
    USING (is_admin(organization_id));

-- ============================================================
-- attendance policies
-- ============================================================

-- Students can view their own attendance
CREATE POLICY attendance_select_own ON attendance
    FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM student_profiles WHERE auth_user_id = auth.uid()
        )
    );

-- Admins can view all attendance
CREATE POLICY attendance_select_admin ON attendance
    FOR SELECT
    USING (is_admin());

-- Students can insert their own attendance
CREATE POLICY attendance_insert_own ON attendance
    FOR INSERT
    WITH CHECK (
        student_id IN (
            SELECT id FROM student_profiles WHERE auth_user_id = auth.uid()
        )
    );

-- Admins can insert attendance
CREATE POLICY attendance_insert_admin ON attendance
    FOR INSERT
    WITH CHECK (is_admin());

-- Admins can update attendance
CREATE POLICY attendance_update_admin ON attendance
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete attendance
CREATE POLICY attendance_delete_admin ON attendance
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- notifications policies
-- ============================================================

-- Users can view their own notifications
CREATE POLICY notifications_select_own ON notifications
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read/archived)
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- sessions policies
-- ============================================================

-- All authenticated users can view sessions
CREATE POLICY sessions_select_authenticated ON sessions
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Admins can insert sessions
CREATE POLICY sessions_insert_admin ON sessions
    FOR INSERT
    WITH CHECK (is_admin());

-- Admins can update sessions
CREATE POLICY sessions_update_admin ON sessions
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete sessions
CREATE POLICY sessions_delete_admin ON sessions
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- audit_logs policies
-- ============================================================

-- Admins can view audit logs
CREATE POLICY audit_logs_select_admin ON audit_logs
    FOR SELECT
    USING (is_admin());

-- Service role handles inserts (no user-level INSERT policy needed;
-- inserts go through the create_audit_log function using service role)
-- Allow inserts from authenticated users for the function to work
CREATE POLICY audit_logs_insert_service ON audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- organizations policies (authenticated SELECT, admin modify)
-- ============================================================

CREATE POLICY organizations_select_authenticated ON organizations
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY organizations_insert_admin ON organizations
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY organizations_update_admin ON organizations
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY organizations_delete_admin ON organizations
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- campuses policies
-- ============================================================

CREATE POLICY campuses_select_authenticated ON campuses
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY campuses_insert_admin ON campuses
    FOR INSERT
    WITH CHECK (is_admin(organization_id));

CREATE POLICY campuses_update_admin ON campuses
    FOR UPDATE
    USING (is_admin(organization_id))
    WITH CHECK (is_admin(organization_id));

CREATE POLICY campuses_delete_admin ON campuses
    FOR DELETE
    USING (is_admin(organization_id));

-- ============================================================
-- courses policies
-- ============================================================

CREATE POLICY courses_select_authenticated ON courses
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY courses_insert_admin ON courses
    FOR INSERT
    WITH CHECK (is_admin(organization_id));

CREATE POLICY courses_update_admin ON courses
    FOR UPDATE
    USING (is_admin(organization_id))
    WITH CHECK (is_admin(organization_id));

CREATE POLICY courses_delete_admin ON courses
    FOR DELETE
    USING (is_admin(organization_id));

-- ============================================================
-- classrooms policies
-- ============================================================

CREATE POLICY classrooms_select_authenticated ON classrooms
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY classrooms_insert_admin ON classrooms
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY classrooms_update_admin ON classrooms
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY classrooms_delete_admin ON classrooms
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- classroom_images policies
-- ============================================================

CREATE POLICY classroom_images_select_authenticated ON classroom_images
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY classroom_images_insert_admin ON classroom_images
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY classroom_images_update_admin ON classroom_images
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY classroom_images_delete_admin ON classroom_images
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- batches policies
-- ============================================================

CREATE POLICY batches_select_authenticated ON batches
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY batches_insert_admin ON batches
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY batches_update_admin ON batches
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY batches_delete_admin ON batches
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- user_roles policies
-- ============================================================

CREATE POLICY user_roles_select_authenticated ON user_roles
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY user_roles_insert_admin ON user_roles
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY user_roles_update_admin ON user_roles
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY user_roles_delete_admin ON user_roles
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- enrollment_images policies
-- ============================================================

CREATE POLICY enrollment_images_select_authenticated ON enrollment_images
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY enrollment_images_insert_admin ON enrollment_images
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY enrollment_images_update_admin ON enrollment_images
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY enrollment_images_delete_admin ON enrollment_images
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- attendance_media policies
-- ============================================================

CREATE POLICY attendance_media_select_authenticated ON attendance_media
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY attendance_media_insert_admin ON attendance_media
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY attendance_media_update_admin ON attendance_media
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY attendance_media_delete_admin ON attendance_media
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- attendance_scores policies
-- ============================================================

CREATE POLICY attendance_scores_select_authenticated ON attendance_scores
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY attendance_scores_insert_admin ON attendance_scores
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY attendance_scores_update_admin ON attendance_scores
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY attendance_scores_delete_admin ON attendance_scores
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- student_devices policies
-- ============================================================

CREATE POLICY student_devices_select_authenticated ON student_devices
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY student_devices_insert_admin ON student_devices
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY student_devices_update_admin ON student_devices
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY student_devices_delete_admin ON student_devices
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- instructor_notes policies
-- ============================================================

CREATE POLICY instructor_notes_select_authenticated ON instructor_notes
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY instructor_notes_insert_admin ON instructor_notes
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY instructor_notes_update_admin ON instructor_notes
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY instructor_notes_delete_admin ON instructor_notes
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- certificates policies
-- ============================================================

CREATE POLICY certificates_select_authenticated ON certificates
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY certificates_insert_admin ON certificates
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY certificates_update_admin ON certificates
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY certificates_delete_admin ON certificates
    FOR DELETE
    USING (is_admin());

-- ============================================================
-- system_settings policies
-- ============================================================

CREATE POLICY system_settings_select_authenticated ON system_settings
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY system_settings_insert_admin ON system_settings
    FOR INSERT
    WITH CHECK (is_admin(organization_id));

CREATE POLICY system_settings_update_admin ON system_settings
    FOR UPDATE
    USING (is_admin(organization_id))
    WITH CHECK (is_admin(organization_id));

CREATE POLICY system_settings_delete_admin ON system_settings
    FOR DELETE
    USING (is_admin(organization_id));
