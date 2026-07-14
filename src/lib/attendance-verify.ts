import { isWithinZones, isWithinAnyZone, haversineDistance, type GeofenceZone } from '@/lib/geofence'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUSPICIOUS_ACCURACY_THRESHOLD = 1
// If a student's two captures within one session are >250m apart, that's suspicious.
const LOCATION_JUMP_METERS = 250

export interface GeoResult {
  allowed: boolean
  zone: GeofenceZone | null
  distance: number
}

// Resolve the geofence decision using dynamic campus zones, falling back to the
// hardcoded zones when campuses have no coordinates configured.
export async function resolveGeofence(
  supabase: SupabaseClient,
  latitude: number,
  longitude: number,
): Promise<GeoResult> {
  const { data: campusData } = await supabase
    .from('campuses')
    .select('name, latitude, longitude, geofence_radius_meters')
    .eq('status', 'active')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  let zones: GeofenceZone[] = []
  if (campusData && campusData.length > 0) {
    zones = campusData.map((c: { name: string; latitude: number; longitude: number; geofence_radius_meters: number | null }) => ({
      name: c.name,
      latitude: c.latitude,
      longitude: c.longitude,
      radiusMeters: c.geofence_radius_meters ?? 500,
    }))
  }

  return zones.length > 0 ? isWithinZones(latitude, longitude, zones) : isWithinAnyZone(latitude, longitude)
}

export interface DetectionInput {
  supabase: SupabaseClient
  sessionId: string
  studentId: string
  latitude: number
  longitude: number
  locationAccuracy?: number | null
  deviceFingerprint?: string | null
}

export interface DetectedFlag {
  flag_type:
    | 'multiple_devices'
    | 'duplicate_device'
    | 'location_change'
    | 'multiple_locations'
    | 'duplicate_session'
    | 'suspicious_accuracy'
    | 'ip_mismatch'
    | 'rapid_resubmission'
    | 'other'
  severity: 'low' | 'medium' | 'high'
  details: Record<string, unknown>
}

// Smart duplicate / anomaly detection. Runs a set of cheap heuristics against
// the current submission and the student's history and returns any flags that
// warrant administrator review.
export async function detectAnomalies(input: DetectionInput): Promise<DetectedFlag[]> {
  const { supabase, sessionId, studentId, latitude, longitude, locationAccuracy, deviceFingerprint } = input
  const flags: DetectedFlag[] = []

  // 1. Impossibly precise GPS accuracy usually means a spoofed/mock location.
  if (locationAccuracy != null && locationAccuracy < SUSPICIOUS_ACCURACY_THRESHOLD) {
    flags.push({
      flag_type: 'suspicious_accuracy',
      severity: 'medium',
      details: { accuracy_m: locationAccuracy },
    })
  }

  // 2. Same device fingerprint already used by a *different* student in this session.
  if (deviceFingerprint) {
    const { data: fpMatch } = await supabase
      .from('attendance')
      .select('id, student_id')
      .eq('session_id', sessionId)
      .eq('device_fingerprint', deviceFingerprint)
      .neq('student_id', studentId)
      .limit(1)
      .maybeSingle()
    if (fpMatch) {
      flags.push({
        flag_type: 'duplicate_device',
        severity: 'high',
        details: { shared_with_student_id: fpMatch.student_id },
      })
    }

    // 2b. This student has previously submitted from several distinct devices.
    const { data: devices } = await supabase
      .from('student_devices')
      .select('fingerprint')
      .eq('student_id', studentId)
    const distinct = new Set((devices || []).map((d: { fingerprint: string }) => d.fingerprint))
    distinct.add(deviceFingerprint)
    if (distinct.size >= 3) {
      flags.push({
        flag_type: 'multiple_devices',
        severity: 'low',
        details: { distinct_devices: distinct.size },
      })
    }
  }

  // 3. Large location jump vs the student's last accepted attendance.
  const { data: lastAccepted } = await supabase
    .from('attendance')
    .select('latitude, longitude, submitted_at')
    .eq('student_id', studentId)
    .not('latitude', 'is', null)
    .in('status', ['approved', 'excused'])
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastAccepted?.latitude != null && lastAccepted?.longitude != null) {
    const jump = haversineDistance(latitude, longitude, lastAccepted.latitude, lastAccepted.longitude)
    if (jump > LOCATION_JUMP_METERS && lastAccepted.submitted_at) {
      const minutesApart = (Date.now() - new Date(lastAccepted.submitted_at).getTime()) / 60000
      // Only flag when the move is physically implausible for the time elapsed.
      if (minutesApart < 60) {
        flags.push({
          flag_type: 'location_change',
          severity: 'medium',
          details: { jump_m: Math.round(jump), minutes_apart: Math.round(minutesApart) },
        })
      }
    }
  }

  return flags
}

// Persist detected flags to the review queue. Returns whether any HIGH-severity
// flag was raised (callers use this to route the attendance to manual_review).
export async function recordFlags(
  service: SupabaseClient,
  args: { attendanceId: string | null; studentId: string; sessionId: string; flags: DetectedFlag[] },
): Promise<{ hasHigh: boolean }> {
  if (args.flags.length === 0) return { hasHigh: false }

  const rows = args.flags.map((f) => ({
    attendance_id: args.attendanceId,
    student_id: args.studentId,
    session_id: args.sessionId,
    flag_type: f.flag_type,
    severity: f.severity,
    details: f.details,
    status: 'open',
  }))

  const { error } = await service.from('attendance_flags').insert(rows)
  if (error) console.error('[attendance-verify] flag insert failed:', error.message)

  return { hasHigh: args.flags.some((f) => f.severity === 'high') }
}
