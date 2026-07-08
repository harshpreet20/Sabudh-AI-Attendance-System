-- 017_harden_function_grants.sql
-- Security hardening for the SECURITY DEFINER functions.
--
-- Every function created in the `public` schema is, by default, granted EXECUTE
-- to PUBLIC, which PostgREST exposes as an RPC callable by the `anon` and
-- `authenticated` roles. For SECURITY DEFINER functions this is dangerous: e.g.
-- `create_user_notification` could be called via /rest/v1/rpc to forge a
-- notification to any user. None of these functions are meant to be called
-- directly over the API — the notification/audit ones only ever run from
-- triggers (which execute them as the owner regardless of role grants), and
-- `create_user_notification` is only ever invoked internally via PERFORM.
--
-- Fix: revoke EXECUTE from PUBLIC/anon/authenticated and pin search_path.
-- `is_admin` is intentionally excluded because it is referenced inside RLS
-- policies and must remain evaluable by signed-in users.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        -- Notification helper + triggers (migration 016)
        'create_user_notification',
        'notify_discussion_reply', 'notify_discussion_answer', 'notify_discussion_upvote',
        'notify_new_thread', 'notify_direct_message',
        'notify_leave_insert', 'notify_leave_update', 'notify_announcement',
        'notify_assignment_insert', 'notify_submission_insert', 'notify_submission_graded',
        'notify_project_insert', 'notify_project_graded',
        'notify_photo_reviewed', 'notify_progress_review',
        -- Pre-existing audit / housekeeping trigger functions (same safe fix)
        'update_updated_at', 'log_student_status_change',
        'log_student_registration', 'log_first_attendance'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    -- Pin search_path so the function can't be hijacked via a mutable path.
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END$$;
