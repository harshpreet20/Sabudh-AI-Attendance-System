import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateQrToken, qrValidationMessage, type QrTokenRow } from '@/lib/qr-token'
import { resolveGeofence, detectAnomalies, recordFlags } from '@/lib/attendance-verify'
import { createNotification } from '@/lib/notifications'

// QR Backup Mode submission. The student scans a faculty-generated QR code; the
// token identifies the session, but GPS + geofence verification remain
// mandatory — the QR only replaces the selfie/verification-word step.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const body = await request.json()
    const { token, latitude, longitude, location_accuracy, device_fingerprint } = body

    if (!token) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'QR token is required' } }, { status: 400 })
    }

    const service = createServiceClient()

    // 1. Validate the token (existence, expiry, revocation, usage cap).
    const { data: tokenRow } = await service
      .from('attendance_qr_tokens')
      .select('id, session_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', token)
      .maybeSingle()

    const validation = validateQrToken(tokenRow as QrTokenRow | null)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_QR', message: qrValidationMessage(validation.reason) } },
        { status: 400 },
      )
    }
    const activeToken = validation.token

    // 2. Student must be active and belong to the session's batch.
    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, status, batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is not active' } }, { status: 403 })
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, status, attendance_close, batch_id')
      .eq('id', activeToken.session_id)
      .single()

    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, { status: 404 })
    }
    if (session.batch_id !== profile.batch_id) {
      return NextResponse.json({ success: false, error: { code: 'WRONG_BATCH', message: 'This session is not for your batch' } }, { status: 403 })
    }
    if (session.status !== 'attendance_open') {
      return NextResponse.json({ success: false, error: { code: 'ATTENDANCE_WINDOW_CLOSED', message: 'Attendance window is not open' } }, { status: 400 })
    }
    if (session.attendance_close && new Date() > new Date(session.attendance_close)) {
      return NextResponse.json({ success: false, error: { code: 'ATTENDANCE_WINDOW_CLOSED', message: 'Attendance window has closed' } }, { status: 400 })
    }

    // 3. GPS + geofence remain mandatory.
    if (latitude == null || longitude == null) {
      return NextResponse.json({ success: false, error: { code: 'LOCATION_REQUIRED', message: 'Location access is required to mark attendance' } }, { status: 400 })
    }
    const geo = await resolveGeofence(supabase, latitude, longitude)
    if (!geo.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OUTSIDE_GEOFENCE',
            message: `You are ${Math.round(geo.distance)}m away from ${geo.zone?.name}. You must be within ${geo.zone?.radiusMeters ?? 500}m to mark attendance.`,
          },
        },
        { status: 403 },
      )
    }

    // 4. Prevent duplicate submission for this session.
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('session_id', session.id)
      .eq('student_id', profile.id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: false, error: { code: 'DUPLICATE_SUBMISSION', message: 'You have already marked attendance for this session' } }, { status: 409 })
    }

    // 5. Smart duplicate / anomaly detection.
    const flags = await detectAnomalies({
      supabase: service,
      sessionId: session.id,
      studentId: profile.id,
      latitude,
      longitude,
      locationAccuracy: location_accuracy,
      deviceFingerprint: device_fingerprint,
    })
    const needsReview = flags.some((f) => f.severity === 'high')

    const now = new Date().toISOString()
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown'

    const { data: attendance, error: insertError } = await service
      .from('attendance')
      .insert({
        session_id: session.id,
        student_id: profile.id,
        status: needsReview ? 'manual_review' : 'approved',
        decision: needsReview ? 'pending' : 'accepted',
        decision_reason: flags.length ? flags.map((f) => f.flag_type).join('; ') : null,
        submitted_at: now,
        verified_at: needsReview ? null : now,
        method: 'qr',
        qr_token_id: activeToken.id,
        browser: request.headers.get('user-agent') || '',
        ip_address: ip !== 'unknown' ? ip : null,
        latitude,
        longitude,
        location_accuracy: location_accuracy || null,
        location_address: geo.zone?.name || null,
        device_fingerprint: device_fingerprint || null,
      })
      .select('id, status, decision, submitted_at')
      .single()

    if (insertError || !attendance) {
      console.error('[qr-submit] insert error:', insertError?.message)
      return NextResponse.json({ success: false, error: { code: 'INSERT_FAILED', message: 'Failed to record attendance' } }, { status: 500 })
    }

    await recordFlags(service, { attendanceId: attendance.id, studentId: profile.id, sessionId: session.id, flags })
    await service
      .from('attendance_qr_tokens')
      .update({ use_count: activeToken.use_count + 1 })
      .eq('id', activeToken.id)

    // 6. Instant notification.
    await createNotification({
      userId: user.id,
      type: needsReview ? 'attendance_marked' : 'attendance_accepted',
      title: needsReview ? 'Attendance flagged for review' : 'Attendance marked',
      message: needsReview
        ? 'Your QR attendance was submitted but flagged for review.'
        : 'Your attendance was recorded via QR backup mode.',
      metadata: { session_id: session.id, method: 'qr' },
    })

    return NextResponse.json({
      success: true,
      data: {
        attendance_id: attendance.id,
        status: attendance.status,
        flagged: needsReview,
        message: needsReview ? 'Attendance submitted but flagged for manual review.' : 'Attendance recorded via QR successfully.',
      },
    })
  } catch (error) {
    console.error('[qr-submit] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to submit attendance' } }, { status: 500 })
  }
}
