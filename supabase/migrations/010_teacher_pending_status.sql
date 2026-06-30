-- Allow 'pending' status for teacher_profiles
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_profiles_status_check;
ALTER TABLE teacher_profiles ADD CONSTRAINT teacher_profiles_status_check
  CHECK (status IN ('pending', 'active', 'inactive'));
