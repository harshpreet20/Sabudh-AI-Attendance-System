-- Teacher profiles table (parallel to student_profiles)
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  profile_image_url TEXT,
  subject_expertise TEXT,
  qualification TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Class schedules table (classes, assessments, topics)
CREATE TABLE IF NOT EXISTS class_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('class', 'assessment', 'topic', 'holiday', 'event')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'postponed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_auth_user ON teacher_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_org ON teacher_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_org ON announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_batch ON announcements(batch_id);
CREATE INDEX IF NOT EXISTS idx_announcements_author ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_schedules_batch ON class_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_instructor ON class_schedules(instructor_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_date ON class_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_class_schedules_type ON class_schedules(schedule_type);

-- Updated_at triggers
CREATE TRIGGER set_teacher_profiles_updated_at
  BEFORE UPDATE ON teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_class_schedules_updated_at
  BEFORE UPDATE ON class_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;

-- Teacher profiles: teachers see own, admins see all
CREATE POLICY teacher_profiles_select ON teacher_profiles
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR is_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'instructor'
      AND organization_id = teacher_profiles.organization_id
    )
  );

CREATE POLICY teacher_profiles_insert ON teacher_profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(organization_id));

CREATE POLICY teacher_profiles_update ON teacher_profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR is_admin(organization_id));

-- Announcements: all authenticated users in org can read, instructors+admins can write
CREATE POLICY announcements_select ON announcements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY announcements_insert ON announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_admin(organization_id)
      OR EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'instructor'
        AND organization_id = announcements.organization_id
      )
    )
  );

CREATE POLICY announcements_update ON announcements
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR is_admin(organization_id)
  );

CREATE POLICY announcements_delete ON announcements
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR is_admin(organization_id)
  );

-- Class schedules: students in batch can read, instructors+admins can write
CREATE POLICY class_schedules_select ON class_schedules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY class_schedules_insert ON class_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    instructor_id = auth.uid()
    AND (
      is_admin(organization_id)
      OR EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'instructor'
        AND organization_id = class_schedules.organization_id
      )
    )
  );

CREATE POLICY class_schedules_update ON class_schedules
  FOR UPDATE TO authenticated
  USING (
    instructor_id = auth.uid()
    OR is_admin(organization_id)
  );

CREATE POLICY class_schedules_delete ON class_schedules
  FOR DELETE TO authenticated
  USING (
    instructor_id = auth.uid()
    OR is_admin(organization_id)
  );
