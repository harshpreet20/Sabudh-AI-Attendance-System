-- Teachers control the attendance window (open/close) and save session topics
-- by UPDATEing the sessions table, but the only UPDATE policy was admin-only
-- (sessions_update_admin -> is_admin()), so those writes were silently blocked
-- by RLS for instructors. Add an instructor UPDATE policy mirroring the
-- existing "Instructors can update attendance" pattern. RLS policies are
-- permissive (OR-ed), so admins keep their existing access.

CREATE POLICY sessions_update_instructor ON public.sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['instructor'::text, 'admin'::text, 'super_admin'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['instructor'::text, 'admin'::text, 'super_admin'::text])
    )
  );
