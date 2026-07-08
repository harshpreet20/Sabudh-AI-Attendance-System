import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import {
  assessStudent,
  type RiskContext,
  type StudentAttendanceStats,
  type RiskAssessment,
} from '@/lib/attendance-risk'

const ACCEPTED_STATUSES = new Set(['approved', 'excused', 'uploaded', 'processing'])
const DEFAULT_THRESHOLD = 75

// Predicts which students are likely to fall short of their attendance
// requirement. GET returns the live assessment; POST additionally persists a
// snapshot row per at-risk student so trends can be charted over time.
async function computeAssessments(): Promise<RiskAssessment[]> {
  const supabase = createServiceClient()

  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, full_name, batch_id, attendance_percentage, present_count, absent_count, late_count, total_sessions')
    .eq('status', 'active')

  if (!students || students.length === 0) return []

  const batchIds = Array.from(new Set(students.map((s) => s.batch_id).filter(Boolean))) as string[]

  const { data: batches } = batchIds.length
    ? await supabase
        .from('batches')
        .select('id, total_planned_sessions, attendance_threshold_pct, courses(attendance_requirement)')
        .in('id', batchIds)
    : { data: [] }

  const ctxByBatch = new Map<string, RiskContext>()
  for (const b of batches || []) {
    const courseArr = b.courses as unknown as { attendance_requirement: number }[] | { attendance_requirement: number } | null
    const course = Array.isArray(courseArr) ? courseArr[0] : courseArr
    ctxByBatch.set(b.id, {
      thresholdPct: b.attendance_threshold_pct ?? course?.attendance_requirement ?? DEFAULT_THRESHOLD,
      totalPlannedSessions: b.total_planned_sessions ?? 0,
    })
  }
  const fallback: RiskContext = { thresholdPct: DEFAULT_THRESHOLD, totalPlannedSessions: 0 }

  // Recent statuses per student for consecutive-absence detection. We pull the
  // most recent accepted attendance rows and reconstruct present/absent against
  // the batch's recent sessions.
  const recentByStudent = await buildRecentStatuses(students.map((s) => ({ id: s.id, batch_id: s.batch_id })))

  return students
    .map((s) => {
      const stats: StudentAttendanceStats = {
        student_id: s.id,
        full_name: s.full_name,
        batch_id: s.batch_id,
        attendance_percentage: Number(s.attendance_percentage) || 0,
        present_count: s.present_count || 0,
        absent_count: s.absent_count || 0,
        late_count: s.late_count || 0,
        total_sessions: s.total_sessions || 0,
        recent_statuses: recentByStudent.get(s.id) || [],
      }
      return assessStudent(stats, (s.batch_id && ctxByBatch.get(s.batch_id)) || fallback)
    })
    .sort((a, b) => b.risk_score - a.risk_score)
}

async function buildRecentStatuses(
  students: Array<{ id: string; batch_id: string | null }>,
): Promise<Map<string, Array<'present' | 'absent' | 'late'>>> {
  const supabase = createServiceClient()
  const result = new Map<string, Array<'present' | 'absent' | 'late'>>()
  const batchIds = Array.from(new Set(students.map((s) => s.batch_id).filter(Boolean))) as string[]
  if (batchIds.length === 0) return result

  // Last ~8 completed sessions per batch.
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, batch_id, session_date')
    .in('batch_id', batchIds)
    .in('status', ['attendance_open', 'attendance_closed', 'completed'])
    .order('session_date', { ascending: false })
    .limit(400)

  if (!sessions) return result

  const recentSessionsByBatch = new Map<string, Array<{ id: string; session_date: string }>>()
  for (const s of sessions) {
    if (!s.batch_id) continue
    const arr = recentSessionsByBatch.get(s.batch_id) ?? []
    if (arr.length < 8) arr.push({ id: s.id, session_date: s.session_date })
    recentSessionsByBatch.set(s.batch_id, arr)
  }

  const relevantSessionIds = Array.from(recentSessionsByBatch.values()).flat().map((s) => s.id)
  if (relevantSessionIds.length === 0) return result

  const { data: attendance } = await supabase
    .from('attendance')
    .select('session_id, student_id, status')
    .in('session_id', relevantSessionIds)

  const presentBySession = new Map<string, Set<string>>()
  for (const a of attendance || []) {
    if (!ACCEPTED_STATUSES.has(a.status)) continue
    const set = presentBySession.get(a.session_id) ?? new Set<string>()
    set.add(a.student_id)
    presentBySession.set(a.session_id, set)
  }

  for (const student of students) {
    if (!student.batch_id) continue
    const batchSessions = recentSessionsByBatch.get(student.batch_id) ?? []
    // Already most-recent-first from the query ordering.
    const statuses = batchSessions.map((s) =>
      presentBySession.get(s.id)?.has(student.id) ? ('present' as const) : ('absent' as const),
    )
    result.set(student.id, statuses)
  }

  return result
}

export async function GET() {
  try {
    await requireAdmin()
    const assessments = await computeAssessments()

    const summary = {
      total: assessments.length,
      critical: assessments.filter((a) => a.risk_level === 'critical').length,
      high: assessments.filter((a) => a.risk_level === 'high').length,
      medium: assessments.filter((a) => a.risk_level === 'medium').length,
      low: assessments.filter((a) => a.risk_level === 'low').length,
    }

    const atRisk = assessments.filter((a) => a.risk_level !== 'low')

    return NextResponse.json({ success: true, data: { summary, assessments: atRisk } })
  } catch (error) {
    console.error('[admin/risk] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to compute risk' } },
      { status: 500 },
    )
  }
}

// Persist a fresh snapshot for every at-risk student (for trend history).
export async function POST() {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const assessments = (await computeAssessments()).filter((a) => a.risk_level !== 'low')

    if (assessments.length > 0) {
      const rows = assessments.map((a) => ({
        student_id: a.student_id,
        batch_id: a.batch_id,
        risk_level: a.risk_level,
        risk_score: a.risk_score,
        projected_pct: a.projected_pct,
        threshold_pct: a.threshold_pct,
        consecutive_absences: a.consecutive_absences,
        factors: a.factors,
        recommendation: a.recommendation,
      }))
      await supabase.from('risk_assessments').insert(rows)

      // Keep student_profiles.risk_score in sync for quick dashboard reads.
      await Promise.all(
        assessments.map((a) =>
          supabase.from('student_profiles').update({ risk_score: a.risk_score }).eq('id', a.student_id),
        ),
      )
    }

    return NextResponse.json({ success: true, data: { snapshotted: assessments.length } })
  } catch (error) {
    console.error('[admin/risk] snapshot error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to snapshot risk' } },
      { status: 500 },
    )
  }
}
