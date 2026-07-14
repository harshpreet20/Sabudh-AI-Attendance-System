import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lightweight activity heartbeat so "last seen" reflects real usage rather than
// only the auth last-sign-in time. Called by the global notifications listener
// on mount. Best-effort — updates the student profile's last_active_at.
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false }, { status: 401 })

    await supabase
      .from('student_profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('auth_user_id', user.id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 200 })
  }
}
