import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPushConfigured, sendPushToUser } from '@/lib/push'

// Send a test push to the current user's devices so they can confirm setup.
export async function POST() {
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

    if (!isPushConfigured()) {
      return NextResponse.json(
        { success: false, error: { code: 'PUSH_DISABLED', message: 'Push notifications are not configured' } },
        { status: 503 }
      )
    }

    const { sent } = await sendPushToUser(user.id, {
      title: 'Sabudh AI',
      body: 'Push notifications are working. You will be notified about attendance, announcements, and more.',
      url: '/dashboard/notifications',
      tag: 'test',
    })

    if (sent === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_DEVICES', message: 'No active devices found for this account' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: { sent } })
  } catch (error) {
    console.error('Push test error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
