-- 015_onboarding_version.sql
-- Version-aware onboarding so that when the tutorial content changes, every
-- user (new AND returning) is shown the updated tour once. The client compares
-- the user's stored version against the current ONBOARDING_VERSION constant and
-- re-triggers the tour whenever it is behind.
--
-- Students track this in the DB (cross-device); instructors/admins use a
-- versioned localStorage key handled entirely on the client.

ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS onboarding_version INTEGER DEFAULT 0;

-- Users who already finished the previous tour are marked as version 1 so the
-- next content bump (version 2) re-shows the updated tutorial exactly once.
UPDATE student_profiles
    SET onboarding_version = 1
    WHERE onboarding_completed = true
      AND (onboarding_version IS NULL OR onboarding_version = 0);
