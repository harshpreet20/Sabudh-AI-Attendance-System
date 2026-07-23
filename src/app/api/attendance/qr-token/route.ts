import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateQrToken } from '@/lib/attendance-qr'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

// Returns the current rotating QR token for a session (teacher display polls this).
export async function GET(request: NextRequest) {
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

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    if (!roles?.some((r) => STAFF_ROLES.includes(r.role))) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403 }
      )
    }

    const sessionId = new URL(request.url).searchParams.get('session_id')
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'session_id is required' } },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data: generateQrToken(sessionId) })
  } catch (error) {
    console.error('QR token error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate token' } },
      { status: 500 }
    )
  }
}
