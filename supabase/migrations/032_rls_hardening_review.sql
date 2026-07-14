-- 032_rls_hardening_review.sql
-- Address PR review findings:
--  * lecture_ai_content / lecture_notes were world-readable to any authenticated
--    user via direct PostgREST (USING true) — that leaks quiz answers
--    (lecture_ai_content) and every lecture's teacher notes. Scope reads to users
--    actually in the lecture's batch (or the owning instructor / admins).
--  * attendance_flags / risk_assessments (fraud surfaces) were readable by every
--    authenticated user — restrict to staff.
--  * Harden the auto-prepare trigger so it never references OLD on INSERT.

-- Helper: may the current user view this lecture/session's content?
CREATE OR REPLACE FUNCTION public.user_can_view_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = p_session_id
      AND (
        s.instructor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
        OR EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.auth_user_id = auth.uid() AND sp.batch_id = s.batch_id)
      )
  );
$$;
-- Callable from RLS by signed-in users, but not exposed to anonymous callers.
REVOKE ALL ON FUNCTION public.user_can_view_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_session(UUID) TO authenticated;

DROP POLICY IF EXISTS lecture_ai_select ON lecture_ai_content;
CREATE POLICY lecture_ai_select ON lecture_ai_content
  FOR SELECT TO authenticated USING (public.user_can_view_session(session_id));

DROP POLICY IF EXISTS lecture_notes_select ON lecture_notes;
CREATE POLICY lecture_notes_select ON lecture_notes
  FOR SELECT TO authenticated USING (public.user_can_view_session(session_id));

-- Fraud/risk surfaces: staff only.
DROP POLICY IF EXISTS attendance_flags_select ON attendance_flags;
CREATE POLICY attendance_flags_select ON attendance_flags
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                 AND role = ANY (ARRAY['instructor', 'admin', 'super_admin'])));

DROP POLICY IF EXISTS risk_assessments_select ON risk_assessments;
CREATE POLICY risk_assessments_select ON risk_assessments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                 AND role = ANY (ARRAY['instructor', 'admin', 'super_admin'])));

-- Harden the auto-prepare trigger: never touch OLD on INSERT.
CREATE OR REPLACE FUNCTION public.on_course_material_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.trigger_lecture_prep(NEW.session_id);
  ELSIF NEW.session_id IS DISTINCT FROM OLD.session_id
        OR (NEW.conversion_status = 'done' AND NEW.conversion_status IS DISTINCT FROM OLD.conversion_status) THEN
    PERFORM public.trigger_lecture_prep(NEW.session_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.on_course_material_change() FROM PUBLIC, anon, authenticated;
