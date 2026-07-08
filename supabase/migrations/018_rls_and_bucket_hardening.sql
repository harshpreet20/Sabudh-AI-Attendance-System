-- 018_rls_and_bucket_hardening.sql
-- Resolves the remaining Supabase advisor findings without changing behaviour:
--
-- 1. public_bucket_allows_listing (avatars, uploads): both buckets are public,
--    so object access goes through the public CDN endpoint and does NOT need an
--    RLS SELECT policy. The broad "Anyone can view …" SELECT policy only enabled
--    clients to LIST every file. The app only ever uploads, removes and reads
--    via getPublicUrl (no .list()/.download()), so dropping it is a no-op for
--    functionality but stops file enumeration.
--
-- 2. rls_policy_always_true (ai_token_usage, discussion_attachments): both INSERT
--    policies used WITH CHECK (true). Every real insert already sets the owning
--    column to the current user (ai_token_usage.user_id = user.id;
--    discussion_attachments.author_id = current user id in all callers), so we
--    tighten the check to that column = auth.uid(). Legitimate inserts are
--    unaffected; forging rows for another user is now blocked.

-- 1. Stop public listing of the public buckets ------------------------------
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view uploads" ON storage.objects;

-- 2a. ai_token_usage: bind inserts to the acting user -----------------------
DROP POLICY IF EXISTS "System can insert token usage" ON public.ai_token_usage;
CREATE POLICY "Users can insert their own token usage"
    ON public.ai_token_usage
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- 2b. discussion_attachments: bind inserts to the uploader ------------------
DROP POLICY IF EXISTS "Authenticated users can insert attachments" ON public.discussion_attachments;
CREATE POLICY "Authenticated users can insert attachments"
    ON public.discussion_attachments
    FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());
