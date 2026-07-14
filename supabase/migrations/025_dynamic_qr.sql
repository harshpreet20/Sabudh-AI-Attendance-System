-- 025_dynamic_qr.sql
-- Dynamic (rotating) QR attendance codes.
-- Each QR session gets a private HMAC secret. The on-screen code is
-- HMAC(secret, 15s-time-step), so it rotates every 15 seconds and a screenshot
-- is useless within moments. The secret must NEVER reach a client, so we remove
-- it from the columns readable by the anon/authenticated roles (the service
-- role, used by the API, bypasses these grants).

ALTER TABLE attendance_qr_tokens ADD COLUMN IF NOT EXISTS secret TEXT;

-- Re-scope column SELECT so clients can read everything they need to display /
-- scan a code, but never the rotating secret. Row visibility is still governed
-- by the existing qr_tokens_select RLS policy.
REVOKE SELECT ON attendance_qr_tokens FROM anon, authenticated;
GRANT SELECT (id, session_id, token, created_by, expires_at, max_uses, use_count, revoked_at, created_at)
  ON attendance_qr_tokens TO anon, authenticated;
