-- 019_engagement_pg_cron.sql
-- Safari / Firefox coverage for AI engagement nudges WITHOUT Vercel Pro.
--
-- Chromium & Edge self-schedule via the service worker's Periodic Background
-- Sync. Safari (iOS 16.4+ installed PWA) and Firefox have no client background
-- scheduler, so they rely on server-side Web Push (VAPID) — which needs a
-- server trigger. We schedule that trigger inside Postgres with pg_cron + pg_net
-- instead of a platform cron, so no paid plan is required.
--
-- Secrets are read from Vault by name (never stored in this migration):
--   * app_base_url          -> e.g. https://attendanceai.harshpreetbhasin.com
--   * engagement_cron_secret -> must equal the app's CRON_SECRET env var
-- Set them once with vault.create_secret(...); until then the trigger no-ops.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_engagement_nudge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'engagement_cron_secret' LIMIT 1;
  IF v_url IS NULL THEN
    RETURN; -- not configured yet
  END IF;
  PERFORM net.http_post(
    url => v_url || '/api/cron/engagement-nudges',
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(v_secret, ''),
      'Content-Type', 'application/json'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_engagement_nudge() FROM PUBLIC, anon, authenticated;

-- Three times a day (09:00 / 14:00 / 20:00 IST = 03:30 / 08:30 / 14:30 UTC).
SELECT cron.schedule('engagement-nudge-morning',   '30 3 * * *',  $$SELECT public.trigger_engagement_nudge();$$);
SELECT cron.schedule('engagement-nudge-afternoon', '30 8 * * *',  $$SELECT public.trigger_engagement_nudge();$$);
SELECT cron.schedule('engagement-nudge-evening',   '30 14 * * *', $$SELECT public.trigger_engagement_nudge();$$);
