-- 027_auto_prepare_lecture.sql
-- Guarantee that a lecture's interactive study content is built in the
-- BACKGROUND, on the server, and cached before any student opens it — driven by
-- the database itself, independent of whichever client uploaded the material.
--
-- When course material is linked to a lecture (or an office file finishes
-- converting), a trigger asks the app (via pg_net) to prepare that lecture. The
-- app endpoint generates + caches the content; staleness there means repeated
-- triggers never double-spend tokens.
--
-- Reuses the same Vault-configured base URL as the engagement job, plus a
-- dedicated secret. No-ops safely until both are set:
--   select vault.create_secret('https://your-app.example', 'app_base_url');
--   select vault.create_secret('<random-string>', 'prep_cron_secret');
-- and set PREP_CRON_SECRET (or CRON_SECRET) in the app env to the same value.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_lecture_prep(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'app_base_url'      LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'prep_cron_secret'  LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN; -- not configured yet; client-side fire-and-forget still covers prep
  END IF;
  PERFORM net.http_post(
    url     => v_url || '/api/internal/prepare-lecture',
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body    => jsonb_build_object('session_id', p_session_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_lecture_prep(uuid) FROM PUBLIC, anon, authenticated;

-- Fire when material is (re)linked to a lecture or an office file finishes
-- converting to a readable PDF — i.e. the moments new readable content appears.
CREATE OR REPLACE FUNCTION public.on_course_material_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR NEW.session_id IS DISTINCT FROM OLD.session_id
       OR (NEW.conversion_status = 'done' AND NEW.conversion_status IS DISTINCT FROM OLD.conversion_status)
     )
  THEN
    PERFORM public.trigger_lecture_prep(NEW.session_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_material_prep ON course_materials;
CREATE TRIGGER trg_course_material_prep
  AFTER INSERT OR UPDATE ON course_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.on_course_material_change();
