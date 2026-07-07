import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Register (or refresh) the current user's push subscription for this device.
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

    const body = await request.json()
    const sub = body?.subscription
    const endpoint: string | undefined = sub?.endpoint
    const p256dh: string | undefined = sub?.keys?.p256dh
    const auth: string | undefined = sub?.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SUBSCRIPTION', message: 'Malformed subscription' } },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get('user-agent') ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )

    if (error) {
      console.error('Push subscribe error:', error)
      return NextResponse.json(
        { success: false, error: { code: 'SAVE_FAILED', message: 'Failed to save subscription' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}

// Remove a subscription for the current user (used when they disable push).
export async function DELETE(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}))
    const endpoint: string | undefined = body?.endpoint

    let query = supabase.from('push_subscriptions').delete().eq('user_id', user.id)
    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }
    const { error } = await query

    if (error) {
      console.error('Push unsubscribe error:', error)
      return NextResponse.json(
        { success: false, error: { code: 'DELETE_FAILED', message: 'Failed to remove subscription' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
