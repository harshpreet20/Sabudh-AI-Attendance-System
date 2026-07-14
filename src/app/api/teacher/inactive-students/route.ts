import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null }
  const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  return { user, role: role?.role ?? null }
}

// Never-logged-in students within the calling instructor's own batches.
// Same shape as /api/admin/inactive-users but scoped to the teacher.
export async function GET() {
  try {
    const { user, role } = await requireStaff()
    if (!user || !['instructor', 'admin', 'super_admin'].includes(role || '')) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
    }

    const service = createServiceClient()

    const { data: batches } = await service.from('batches').select('id, name').eq('instructor_id', user.id)
    const batchIds = (batches || []).map((b) => b.id)
    if (batchIds.length === 0) {
      return NextResponse.json({ success: true, data: { summary: { never_logged_in: 0, total_students: 0 }, students: [] } })
    }
    const batchNameById = new Map((batches || []).map((b) => [b.id, b.name]))

    const { data: students } = await service
      .from('student_profiles')
      .select('id, full_name, email, phone, status, created_at, last_active_at, auth_user_id, batch_id')
      .in('batch_id', batchIds)

    const roster = students || []

    // Map auth_user_id -> last_sign_in_at via the admin API.
    const signInMap = new Map<string, string | null>()
    let page = 1
    for (;;) {
      const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 })
      if (!data?.users?.length) break
      for (const u of data.users) signInMap.set(u.id, u.last_sign_in_at ?? null)
      if (data.users.length < 1000) break
      page++
    }

    const never = roster
      .filter((s) => !s.auth_user_id || !signInMap.get(s.auth_user_id))
      .map((s) => ({
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        batch_name: s.batch_id ? batchNameById.get(s.batch_id) ?? null : null,
        created_at: s.created_at,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return NextResponse.json({
      success: true,
      data: { summary: { never_logged_in: never.length, total_students: roster.length }, students: never },
    })
  } catch (error) {
    console.error('[teacher/inactive-students] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load' } }, { status: 500 })
  }
}
