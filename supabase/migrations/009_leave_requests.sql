-- Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leave_requests_student ON leave_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_batch ON leave_requests(batch_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date ON leave_requests(leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

-- Updated_at trigger
CREATE TRIGGER set_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- Students can view their own leave requests
CREATE POLICY leave_requests_select ON leave_requests
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM student_profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('instructor', 'admin', 'super_admin')
    )
  );

-- Students can insert their own leave requests
CREATE POLICY leave_requests_insert ON leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (
      SELECT id FROM student_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Instructors and admins can update (approve/reject)
CREATE POLICY leave_requests_update ON leave_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('instructor', 'admin', 'super_admin')
    )
    OR student_id IN (
      SELECT id FROM student_profiles WHERE auth_user_id = auth.uid()
    )
  );
