-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  batch_id UUID NOT NULL REFERENCES batches(id),
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  max_score INTEGER DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assignment submissions
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_profiles(id),
  content TEXT,
  file_urls TEXT[] DEFAULT '{}',
  score INTEGER,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'returned', 'resubmitted')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);

-- Progress reviews
CREATE TABLE IF NOT EXISTS progress_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student_profiles(id),
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  batch_id UUID NOT NULL REFERENCES batches(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT NOT NULL,
  areas_of_improvement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  batch_id UUID NOT NULL REFERENCES batches(id),
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  requirements TEXT,
  resources TEXT,
  due_date DATE,
  max_score INTEGER DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'in_review', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project submissions
CREATE TABLE IF NOT EXISTS project_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_profiles(id),
  title TEXT,
  content TEXT,
  file_urls TEXT[] DEFAULT '{}',
  demo_url TEXT,
  score INTEGER,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'graded', 'returned', 'resubmitted')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, student_id)
);

-- Add meeting fields to class_schedules
ALTER TABLE class_schedules ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE class_schedules ADD COLUMN IF NOT EXISTS meeting_provider TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_batch ON assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_assignments_instructor ON assignments(instructor_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_reviews_student ON progress_reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_reviews_instructor ON progress_reviews(instructor_id);
CREATE INDEX IF NOT EXISTS idx_projects_batch ON projects(batch_id);
CREATE INDEX IF NOT EXISTS idx_projects_instructor ON projects(instructor_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_project ON project_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_student ON project_submissions(student_id);

-- Triggers
CREATE TRIGGER set_assignments_updated_at BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_assignment_submissions_updated_at BEFORE UPDATE ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_progress_reviews_updated_at BEFORE UPDATE ON progress_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_project_submissions_updated_at BEFORE UPDATE ON project_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_submissions ENABLE ROW LEVEL SECURITY;

-- Assignments policies
CREATE POLICY "Instructors manage own assignments" ON assignments
  FOR ALL USING (instructor_id = auth.uid());
CREATE POLICY "Students view batch assignments" ON assignments
  FOR SELECT USING (
    batch_id IN (SELECT batch_id FROM student_profiles WHERE auth_user_id = auth.uid())
  );

-- Submission policies
CREATE POLICY "Students manage own submissions" ON assignment_submissions
  FOR ALL USING (
    student_id IN (SELECT id FROM student_profiles WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Instructors view assignment submissions" ON assignment_submissions
  FOR ALL USING (
    assignment_id IN (SELECT id FROM assignments WHERE instructor_id = auth.uid())
  );

-- Progress review policies
CREATE POLICY "Instructors manage reviews" ON progress_reviews
  FOR ALL USING (instructor_id = auth.uid());
CREATE POLICY "Students view own reviews" ON progress_reviews
  FOR SELECT USING (
    student_id IN (SELECT id FROM student_profiles WHERE auth_user_id = auth.uid())
  );

-- Projects policies
CREATE POLICY "Instructors manage own projects" ON projects
  FOR ALL USING (instructor_id = auth.uid());
CREATE POLICY "Students view batch projects" ON projects
  FOR SELECT USING (
    batch_id IN (SELECT batch_id FROM student_profiles WHERE auth_user_id = auth.uid())
  );

-- Project submission policies
CREATE POLICY "Students manage own project submissions" ON project_submissions
  FOR ALL USING (
    student_id IN (SELECT id FROM student_profiles WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Instructors view project submissions" ON project_submissions
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE instructor_id = auth.uid())
  );
