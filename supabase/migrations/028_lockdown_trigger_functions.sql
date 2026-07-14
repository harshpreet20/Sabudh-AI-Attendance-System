-- 028_lockdown_trigger_functions.sql
-- Advisor fix (0028/0029): the auto-prepare trigger functions from migration 027
-- were SECURITY DEFINER and callable via the REST RPC surface. Trigger functions
-- should never be invoked directly, so revoke EXECUTE from the client roles.
-- This does NOT affect trigger firing (the trigger owns the invocation), so the
-- auto-prepare pipeline is unaffected.
REVOKE ALL ON FUNCTION public.on_course_material_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_lecture_prep(uuid) FROM PUBLIC, anon, authenticated;
