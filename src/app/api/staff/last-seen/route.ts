import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Returns last-login (auth) and last-active (heartbeat) timestamps for a
// student, for display on staff-facing profiles and the chat. Accessible to
// instructors and admins only.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    }

    const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    if (!role || !['instructor', 'admin', 'super_admin'].includes(role.role)) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
    }

    const url = new URL(request.url)
    const studentId = url.searchParams.get('student_id')
    const authUserId = url.searchParams.get('auth_user_id')
    if (!studentId && !authUserId) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'student_id or auth_user_id required' } }, { status: 400 })
    }

    const service = createServiceClient()

    let resolvedAuthId = authUserId
    let lastActiveAt: string | null = null

    if (studentId) {
      const { data: profile } = await service
        .from('student_profiles')
        .select('auth_user_id, last_active_at')
        .eq('id', studentId)
        .maybeSingle()
      resolvedAuthId = profile?.auth_user_id ?? null
      lastActiveAt = profile?.last_active_at ?? null
    } else if (authUserId) {
      const { data: profile } = await service
        .from('student_profiles')
        .select('last_active_at')
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      lastActiveAt = profile?.last_active_at ?? null
    }

    let lastSignInAt: string | null = null
    if (resolvedAuthId) {
      const { data } = await service.auth.admin.getUserById(resolvedAuthId)
      lastSignInAt = data?.user?.last_sign_in_at ?? null
    }

    return NextResponse.json({
      success: true,
      data: {
        last_sign_in_at: lastSignInAt,
        last_active_at: lastActiveAt,
        never_logged_in: !lastSignInAt,
      },
    })
  } catch (error) {
    console.error('[staff/last-seen] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
