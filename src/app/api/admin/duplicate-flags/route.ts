import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'

// Smart Duplicate Detection review queue for administrators.
// GET   -> list flags (optionally filter by status)
// PATCH -> resolve a flag (dismiss / confirm) and, when confirmed, route the
//          underlying attendance to manual review.
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const status = new URL(request.url).searchParams.get('status') || 'open'

    let query = supabase
      .from('attendance_flags')
      .select('id, attendance_id, student_id, session_id, flag_type, severity, details, status, created_at, student_profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error) {
      console.error('[duplicate-flags] fetch error:', error.message)
      return NextResponse.json({ success: false, error: { code: 'FETCH_FAILED', message: 'Failed to load flags' } }, { status: 500 })
    }

    const flags = (data || []).map((f) => {
      const sp = f.student_profiles as unknown as { full_name: string; email: string }[] | { full_name: string; email: string } | null
      const student = Array.isArray(sp) ? sp[0] : sp
      return {
        id: f.id,
        attendance_id: f.attendance_id,
        student_id: f.student_id,
        session_id: f.session_id,
        flag_type: f.flag_type,
        severity: f.severity,
        details: f.details,
        status: f.status,
        created_at: f.created_at,
        student_name: student?.full_name || 'Student',
        student_email: student?.email || '',
      }
    })

    const counts = {
      open: flags.filter((f) => f.status === 'open').length,
      high: flags.filter((f) => f.severity === 'high' && f.status === 'open').length,
    }

    return NextResponse.json({ success: true, data: { flags, counts } })
  } catch (error) {
    console.error('[duplicate-flags] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdmin()
    const supabase = createServiceClient()
    const body = await request.json()
    const { flag_id, action } = body as { flag_id?: string; action?: 'dismiss' | 'confirm' }

    if (!flag_id || !action) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'flag_id and action are required' } }, { status: 400 })
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'dismissed'

    const { data: flag } = await supabase
      .from('attendance_flags')
      .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', flag_id)
      .select('attendance_id')
      .single()

    // A confirmed flag pushes the underlying attendance into manual review.
    if (action === 'confirm' && flag?.attendance_id) {
      await supabase
        .from('attendance')
        .update({ status: 'manual_review', decision: 'manual_review', decision_reason: 'Confirmed duplicate/anomaly flag' })
        .eq('id', flag.attendance_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[duplicate-flags] patch error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }, { status: 500 })
  }
}
