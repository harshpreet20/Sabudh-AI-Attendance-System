import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification, type NotificationType } from '@/lib/notifications'

const ALLOWED_TYPES: NotificationType[] = [
  'low_attendance',
  'attendance_reminder',
  'info',
  'system',
  'schedule_updated',
  'class_cancelled',
]

// Admin quick-action: send an in-app + push notification to a student (used by
// the at-risk dashboard widget's "Notify" button).
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    const { student_id, title, message, type } = body as {
      student_id?: string
      title?: string
      message?: string
      type?: NotificationType
    }

    if (!student_id || !title || !message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'student_id, title and message are required' } },
        { status: 400 },
      )
    }

    const notificationType: NotificationType = type && ALLOWED_TYPES.includes(type) ? type : 'info'

    const supabase = createServiceClient()
    const { data: profile } = await supabase
      .from('student_profiles')
      .select('auth_user_id')
      .eq('id', student_id)
      .maybeSingle()

    if (!profile?.auth_user_id) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } }, { status: 404 })
    }

    await createNotification({
      userId: profile.auth_user_id,
      type: notificationType,
      title,
      message,
      metadata: { source: 'admin_quick_action' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin/notify-student] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to notify' } }, { status: 500 })
  }
}
