-- 026_batch_upload_lock.sql
-- Admins can "stop uploads" per batch. When a batch is locked, instructors can
-- no longer add course materials to it; admins/super_admins are never blocked
-- (they can still upload and delete). Enforced in the DB so it holds regardless
-- of the UI.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS uploads_locked BOOLEAN NOT NULL DEFAULT false;

-- Re-scope the insert policy: admins always allowed; instructors only when the
-- target batch is not locked.
DROP POLICY IF EXISTS course_materials_insert ON course_materials;
CREATE POLICY course_materials_insert ON course_materials
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
    )
    OR (
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'instructor'::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM batches b
        WHERE b.id = course_materials.batch_id
          AND b.uploads_locked = true
      )
    )
  );
