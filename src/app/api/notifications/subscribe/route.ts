import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Stores/removes a browser Web Push subscription for the current user so the
// server can deliver instant push notifications (no SMS required).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const sub = body.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid subscription' } }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent') || null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('[notifications/subscribe] upsert failed:', error.message)
    return NextResponse.json({ success: false, error: { code: 'INSERT_FAILED', message: 'Failed to save subscription' } }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { vapid_configured: !!process.env.VAPID_PUBLIC_KEY } })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
  }

  const endpoint = new URL(request.url).searchParams.get('endpoint')
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  }
  return NextResponse.json({ success: true })
}

// Exposes the public VAPID key to the client so it can create a subscription.
export async function GET() {
  return NextResponse.json({ success: true, data: { public_key: process.env.VAPID_PUBLIC_KEY || null } })
}
