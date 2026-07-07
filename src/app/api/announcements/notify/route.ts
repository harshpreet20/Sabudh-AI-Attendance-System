import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationToUsers } from '@/lib/notify'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

// Notify students about a newly published announcement.
// Called by the client after the announcement row is created.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleRow || !STAFF_ROLES.includes(roleRow.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const batchId: string | null = body?.batch_id ?? null
    const title = String(body?.title ?? '').trim()
    const content = String(body?.content ?? '').trim()

    if (!title) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Missing title' } },
        { status: 400 }
      )
    }

    // Target the batch's active students, or every active student when
    // the announcement isn't scoped to a batch.
    const service = createServiceClient()
    let query = service
      .from('student_profiles')
      .select('auth_user_id')
      .eq('status', 'active')
    if (batchId) query = query.eq('batch_id', batchId)
    const { data: students } = await query

    const userIds = (students ?? [])
      .map((s) => s.auth_user_id as string | null)
      .filter((id): id is string => Boolean(id) && id !== user.id)

    const preview = content.length > 140 ? `${content.slice(0, 137)}…` : content

    await sendNotificationToUsers(userIds, {
      type: 'info',
      title: `📢 ${title}`,
      message: preview || 'A new announcement was posted.',
      url: '/dashboard/announcements',
    })

    return NextResponse.json({ success: true, data: { sent: userIds.length } })
  } catch (error) {
    console.error('Announcement notify error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
