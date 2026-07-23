import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

// Apply reviewed register marks to a session. Present students get an approved
// (grace) attendance record; students marked absent have any existing record
// for this session removed. Only affects the students explicitly passed in.
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
    const marks: Array<{ student_id: string; present: boolean }> = Array.isArray(body?.marks)
      ? body.marks
      : []
    if (!sessionId || marks.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'session_id and marks are required' } },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const now = new Date().toISOString()
    const presentIds = marks.filter((m) => m.present).map((m) => m.student_id)
    const absentIds = marks.filter((m) => !m.present).map((m) => m.student_id)

    let marked = 0
    if (presentIds.length > 0) {
      const rows = presentIds.map((student_id) => ({
        session_id: sessionId,
        student_id,
        status: 'approved',
        decision: 'accepted',
        decision_reason: 'Register upload (OCR)',
        is_grace: true,
        grace_reason: 'Marked present from uploaded register',
        grace_granted_by: user.id,
        submitted_at: now,
        verified_at: now,
      }))
      const { error } = await service
        .from('attendance')
        .upsert(rows, { onConflict: 'session_id,student_id' })
      if (error) {
        return NextResponse.json(
          { success: false, error: { code: 'WRITE_FAILED', message: error.message } },
          { status: 500 }
        )
      }
      marked = presentIds.length
    }

    let cleared = 0
    if (absentIds.length > 0) {
      const { error, count } = await service
        .from('attendance')
        .delete({ count: 'exact' })
        .eq('session_id', sessionId)
        .in('student_id', absentIds)
      if (error) {
        return NextResponse.json(
          { success: false, error: { code: 'WRITE_FAILED', message: error.message } },
          { status: 500 }
        )
      }
      cleared = count ?? 0
    }

    return NextResponse.json({ success: true, data: { marked_present: marked, marked_absent: cleared } })
  } catch (error) {
    console.error('OCR apply error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to apply attendance' } },
      { status: 500 }
    )
  }
}
