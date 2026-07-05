import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin manual attendance override.
// Body: { session_id, student_id, action: 'present' | 'absent' }
//   present -> upsert an approved (grace) attendance record for the student
//   absent  -> remove any attendance record for the student in that session
export async function POST(request: NextRequest) {
  try {
    // Verify the caller is an admin.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isAdmin = roles?.some((r) => ['admin', 'super_admin'].includes(r.role))
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { session_id, student_id, action } = await request.json()

    if (!session_id || !student_id || !['present', 'absent'].includes(action)) {
      return NextResponse.json(
        { error: 'session_id, student_id and a valid action are required' },
        { status: 400 }
      )
    }

    const admin = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (action === 'absent') {
      const { error } = await admin
        .from('attendance')
        .delete()
        .eq('session_id', session_id)
        .eq('student_id', student_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, status: 'absent' })
    }

    // action === 'present'
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('attendance')
      .upsert(
        {
          session_id,
          student_id,
          status: 'approved',
          decision: 'accepted',
          decision_reason: 'Admin manual override',
          is_grace: true,
          grace_reason: 'Admin manual override',
          grace_granted_by: user.id,
          submitted_at: now,
          verified_at: now,
        },
        { onConflict: 'session_id,student_id' }
      )
      .select('id, status, decision')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'present', attendance: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Override failed' },
      { status: 500 }
    )
  }
}
