import type { SupabaseClient } from '@supabase/supabase-js'

export interface LectureAccess {
  ok: boolean
  isStaff: boolean
  role: string | null
  studentProfileId: string | null
  session: { id: string; batch_id: string | null; instructor_id: string | null; session_date: string; status: string; topic_taught: string | null } | null
}

// A user may open a lecture workspace if they are staff (admin/instructor) or a
// student enrolled in the lecture's batch. Uses the service client to read.
export async function getLectureAccess(
  service: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<LectureAccess> {
  const deny: LectureAccess = { ok: false, isStaff: false, role: null, studentProfileId: null, session: null }

  const { data: session } = await service
    .from('sessions')
    .select('id, batch_id, instructor_id, session_date, status, topic_taught')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return deny

  const { data: roleRow } = await service.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  const role = roleRow?.role ?? null

  // Admins/super-admins may access any lecture.
  if (role && ['admin', 'super_admin'].includes(role)) {
    return { ok: true, isStaff: true, role, studentProfileId: null, session }
  }

  // Instructors are staff only for lectures they actually teach — the session's
  // own instructor, or the instructor assigned to that session's batch. This
  // prevents one instructor reading/editing another's lecture content.
  if (role === 'instructor') {
    let teaches = session.instructor_id === userId
    if (!teaches && session.batch_id) {
      const { data: batch } = await service.from('batches').select('instructor_id').eq('id', session.batch_id).maybeSingle()
      teaches = batch?.instructor_id === userId
    }
    if (teaches) {
      return { ok: true, isStaff: true, role, studentProfileId: null, session }
    }
    return { ...deny, session }
  }

  const { data: profile } = await service
    .from('student_profiles')
    .select('id, batch_id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (profile && profile.batch_id && profile.batch_id === session.batch_id) {
    return { ok: true, isStaff: false, role: role || 'student', studentProfileId: profile.id, session }
  }

  return { ...deny, session }
}
