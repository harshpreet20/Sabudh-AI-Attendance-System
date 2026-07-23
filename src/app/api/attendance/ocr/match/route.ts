import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { matchRosterFromLines } from '@/lib/ocr-baidu'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

// Match OCR text lines (produced on-device by Tesseract) to the session roster.
// Returns the present/absent preview plus how many names were matched, so the
// client can decide whether the local read was good enough or should escalate.
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

    const body = await request.json()
    const sessionId: string | undefined = body?.session_id
    const lines: string[] = Array.isArray(body?.lines) ? body.lines : []
    if (!sessionId || lines.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'session_id and lines are required' } },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: session } = await service
      .from('sessions')
      .select('id, batch_id')
      .eq('id', sessionId)
      .single()
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } },
        { status: 404 }
      )
    }

    const { data: students } = await service
      .from('student_profiles')
      .select('id, full_name')
      .eq('batch_id', session.batch_id)
      .eq('status', 'active')
      .order('full_name')

    const roster = (students ?? []).map((s) => ({ id: s.id, name: s.full_name }))
    if (roster.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_STUDENTS', message: 'No active students in this batch' } },
        { status: 400 }
      )
    }

    const matched = matchRosterFromLines(roster, lines)
    const results = matched.map((m) => ({
      student_id: m.student_id,
      name: m.name,
      present: m.present,
    }))

    return NextResponse.json({
      success: true,
      data: {
        session_id: sessionId,
        results,
        matched: matched.filter((m) => m.matched).length,
        total: matched.length,
        present_count: results.filter((r) => r.present).length,
      },
    })
  } catch (error) {
    console.error('OCR match error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to match the roster' } },
      { status: 500 }
    )
  }
}
