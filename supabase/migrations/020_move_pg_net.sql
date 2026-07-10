-- 020_move_pg_net.sql
-- Advisor fix (extension_in_public): migration 019 created pg_net in the public
-- schema. pg_net is NOT relocatable, so it can't be moved with ALTER EXTENSION
-- SET SCHEMA — it must be dropped and recreated in the extensions schema.
--
-- Safe because: pg_net always keeps its API functions in the `net` schema
-- regardless of the extension's registration schema, so public.trigger_engagement_nudge()
-- (which calls net.http_post) is unaffected; and only that trigger references
-- pg_net (no Supabase webhooks). DDL is transactional — a failure rolls back
-- and leaves pg_net exactly as it was.
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
