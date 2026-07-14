import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveGeofence, detectAnomalies, recordFlags } from '@/lib/attendance-verify'
import { createNotification } from '@/lib/notifications'

interface OfflineItem {
  client_dedup_key: string
  session_id: string
  latitude: number
  longitude: number
  location_accuracy?: number | null
  device_fingerprint?: string | null
  captured_at: string // ISO timestamp of when it was captured offline
}

interface SyncResult {
  client_dedup_key: string
  status: 'synced' | 'duplicate' | 'rejected' | 'error'
  reason?: string
  attendance_id?: string
}

// Offline Attendance Mode sync endpoint. The device queues captures locally
// (encrypted) while offline and replays them here once connectivity returns.
// GPS/geofence verification is re-run server-side — the offline queue never
// bypasses location checks — and client_dedup_key makes replay idempotent.
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
    const items: OfflineItem[] = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return NextResponse.json({ success: true, data: { results: [] } })
    }
    if (items.length > 50) {
      return NextResponse.json({ success: false, error: { code: 'TOO_MANY', message: 'Sync at most 50 items at a time' } }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, status, batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile || profile.status !== 'active') {
      return NextResponse.json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is not active' } }, { status: 403 })
    }

    const service = createServiceClient()
    const results: SyncResult[] = []

    for (const item of items) {
      const result = await syncOne(service, supabase, user.id, profile, item)
      results.push(result)
    }

    const synced = results.filter((r) => r.status === 'synced').length
    return NextResponse.json({ success: true, data: { synced, total: items.length, results } })
  } catch (error) {
    console.error('[offline-sync] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Sync failed' } }, { status: 500 })
  }
}

async function syncOne(
  service: ReturnType<typeof createServiceClient>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profile: { id: string; batch_id: string | null },
  item: OfflineItem,
): Promise<SyncResult> {
  const key = item.client_dedup_key
  try {
    if (!key || !item.session_id) {
      return { client_dedup_key: key || 'unknown', status: 'error', reason: 'Missing session or dedup key' }
    }

    // Idempotency: this capture may already have synced from another device/tab.
    const { data: dupe } = await service
      .from('attendance')
      .select('id')
      .eq('student_id', profile.id)
      .eq('client_dedup_key', key)
      .maybeSingle()
    if (dupe) {
      return { client_dedup_key: key, status: 'duplicate', attendance_id: dupe.id }
    }

    if (item.latitude == null || item.longitude == null) {
      return { client_dedup_key: key, status: 'rejected', reason: 'Location was not captured' }
    }

    const { data: session } = await service
      .from('sessions')
      .select('id, batch_id, status, attendance_open, attendance_close')
      .eq('id', item.session_id)
      .maybeSingle()
    if (!session) return { client_dedup_key: key, status: 'rejected', reason: 'Session not found' }
    if (session.batch_id !== profile.batch_id) {
      return { client_dedup_key: key, status: 'rejected', reason: 'Session is not for your batch' }
    }

    // Enforce the attendance window at the captured time, so an offline item
    // can't backfill attendance for a session whose window never opened, was
    // cancelled, or that was captured outside the open/close window.
    if (session.status === 'cancelled' || session.status === 'scheduled') {
      return { client_dedup_key: key, status: 'rejected', reason: 'Attendance was not open for this session' }
    }
    if (!session.attendance_open) {
      return { client_dedup_key: key, status: 'rejected', reason: 'Attendance was not open for this session' }
    }
    const capturedAt = item.captured_at ? new Date(item.captured_at) : new Date()
    if (isNaN(capturedAt.getTime()) || capturedAt < new Date(session.attendance_open)) {
      return { client_dedup_key: key, status: 'rejected', reason: 'Captured before attendance opened' }
    }
    if (session.attendance_close && capturedAt > new Date(session.attendance_close)) {
      return { client_dedup_key: key, status: 'rejected', reason: 'Captured after attendance closed' }
    }

    // Already have a live (non-offline) row for this session?
    const { data: existing } = await service
      .from('attendance')
      .select('id')
      .eq('session_id', session.id)
      .eq('student_id', profile.id)
      .maybeSingle()
    if (existing) return { client_dedup_key: key, status: 'duplicate', attendance_id: existing.id }

    // Geofence is still mandatory for offline captures.
    const geo = await resolveGeofence(supabase, item.latitude, item.longitude)
    if (!geo.allowed) {
      return { client_dedup_key: key, status: 'rejected', reason: `Outside allowed zone (${Math.round(geo.distance)}m from ${geo.zone?.name})` }
    }

    const flags = await detectAnomalies({
      supabase: service,
      sessionId: session.id,
      studentId: profile.id,
      latitude: item.latitude,
      longitude: item.longitude,
      locationAccuracy: item.location_accuracy,
      deviceFingerprint: item.device_fingerprint,
    })
    const needsReview = flags.some((f) => f.severity === 'high')
    const now = new Date().toISOString()

    const { data: attendance, error } = await service
      .from('attendance')
      .insert({
        session_id: session.id,
        student_id: profile.id,
        status: needsReview ? 'manual_review' : 'approved',
        decision: needsReview ? 'pending' : 'accepted',
        decision_reason: flags.length ? flags.map((f) => f.flag_type).join('; ') : null,
        submitted_at: item.captured_at || now,
        client_captured_at: item.captured_at || null,
        synced_at: now,
        verified_at: needsReview ? null : now,
        method: 'offline',
        client_dedup_key: key,
        latitude: item.latitude,
        longitude: item.longitude,
        location_accuracy: item.location_accuracy || null,
        location_address: geo.zone?.name || null,
        device_fingerprint: item.device_fingerprint || null,
      })
      .select('id')
      .single()

    if (error || !attendance) {
      // Unique-violation means a concurrent sync beat us — treat as duplicate.
      if (error?.code === '23505') return { client_dedup_key: key, status: 'duplicate' }
      console.error('[offline-sync] insert error:', error?.message)
      return { client_dedup_key: key, status: 'error', reason: 'Insert failed' }
    }

    await recordFlags(service, { attendanceId: attendance.id, studentId: profile.id, sessionId: session.id, flags })
    await createNotification({
      userId,
      type: needsReview ? 'attendance_marked' : 'attendance_accepted',
      title: needsReview ? 'Offline attendance flagged' : 'Offline attendance synced',
      message: needsReview
        ? 'A queued attendance was synced but flagged for review.'
        : 'Your offline attendance was synced successfully.',
      metadata: { session_id: session.id, method: 'offline' },
    })

    return { client_dedup_key: key, status: 'synced', attendance_id: attendance.id }
  } catch (err) {
    console.error('[offline-sync] item error:', err instanceof Error ? err.message : err)
    return { client_dedup_key: key || 'unknown', status: 'error', reason: 'Unexpected error' }
  }
}
