import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import {
  type AnalyticsRecord,
  dayOfWeekDistribution,
  timeSlotDistribution,
  weeklyHeatmap,
  monthlyHeatmap,
  subjectHeatmap,
  facultyHeatmap,
  classRanking,
  mostAbsentStudents,
} from '@/lib/attendance-analytics'

const ACCEPTED_STATUSES = new Set(['approved', 'excused', 'uploaded', 'processing'])

// Builds the topic-based heatmap dataset for the admin analytics dashboard.
// A session that has reached (or passed) an open state means every active
// student in its batch was "expected"; those without an accepted attendance
// row are counted as absent, which is what makes true absence heatmaps possible.
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()

    const url = new URL(request.url)
    const days = Math.min(365, Math.max(7, parseInt(url.searchParams.get('days') || '90')))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 1. Relevant sessions in range.
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, batch_id, instructor_id, session_date, attendance_open, status')
      .gte('session_date', since)
      .in('status', ['attendance_open', 'attendance_closed', 'completed'])

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ success: true, data: emptyPayload() })
    }

    const sessionIds = sessions.map((s) => s.id)
    const batchIds = Array.from(new Set(sessions.map((s) => s.batch_id).filter(Boolean))) as string[]

    // 2. Supporting lookups (batches -> course, instructor names, students).
    const [{ data: batches }, { data: students }, { data: teachers }, { data: attendance }] =
      await Promise.all([
        supabase.from('batches').select('id, name, course_id, instructor_id, courses(id, title)').in('id', batchIds),
        supabase
          .from('student_profiles')
          .select('id, full_name, batch_id')
          .in('batch_id', batchIds)
          .eq('status', 'active'),
        supabase.from('teacher_profiles').select('auth_user_id, full_name'),
        supabase
          .from('attendance')
          .select('session_id, student_id, status')
          .in('session_id', sessionIds),
      ])

    const batchMap = new Map(
      (batches || []).map((b) => {
        const courseArr = b.courses as unknown as { id: string; title: string }[] | { id: string; title: string } | null
        const course = Array.isArray(courseArr) ? courseArr[0] : courseArr
        return [b.id, { name: b.name, course_id: course?.id ?? null, course_name: course?.title ?? null, instructor_id: b.instructor_id }]
      }),
    )
    const teacherMap = new Map((teachers || []).map((t) => [t.auth_user_id, t.full_name]))
    const studentMap = new Map((students || []).map((s) => [s.id, s]))

    // batch_id -> list of active student ids
    const studentsByBatch = new Map<string, string[]>()
    for (const s of students || []) {
      if (!s.batch_id) continue
      const arr = studentsByBatch.get(s.batch_id) ?? []
      arr.push(s.id)
      studentsByBatch.set(s.batch_id, arr)
    }

    // session_id -> set of present student ids
    const presentBySession = new Map<string, Set<string>>()
    for (const a of attendance || []) {
      if (!ACCEPTED_STATUSES.has(a.status)) continue
      const set = presentBySession.get(a.session_id) ?? new Set<string>()
      set.add(a.student_id)
      presentBySession.set(a.session_id, set)
    }

    // 3. Expand into per-student-per-session outcome records.
    const records: AnalyticsRecord[] = []
    for (const session of sessions) {
      if (!session.batch_id) continue
      const roster = studentsByBatch.get(session.batch_id) ?? []
      if (roster.length === 0) continue
      const present = presentBySession.get(session.id) ?? new Set<string>()
      const batch = batchMap.get(session.batch_id)
      const instructorId = session.instructor_id || batch?.instructor_id || null
      const hour = session.attendance_open ? new Date(session.attendance_open).getHours() : null

      for (const studentId of roster) {
        records.push({
          student_id: studentId,
          student_name: studentMap.get(studentId)?.full_name,
          session_date: session.session_date,
          outcome: present.has(studentId) ? 'present' : 'absent',
          batch_id: session.batch_id,
          batch_name: batch?.name ?? null,
          course_id: batch?.course_id ?? null,
          course_name: batch?.course_name ?? null,
          instructor_id: instructorId,
          instructor_name: instructorId ? teacherMap.get(instructorId) ?? null : null,
          hour,
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        range_days: days,
        total_records: records.length,
        day_of_week: dayOfWeekDistribution(records),
        time_slots: timeSlotDistribution(records),
        weekly: weeklyHeatmap(records),
        monthly: monthlyHeatmap(records),
        subjects: subjectHeatmap(records),
        faculty: facultyHeatmap(records),
        class_ranking: classRanking(records),
        most_absent: mostAbsentStudents(records, 10),
      },
    })
  } catch (error) {
    console.error('[analytics/heatmaps] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to build heatmaps' } },
      { status: 500 },
    )
  }
}

function emptyPayload() {
  return {
    range_days: 0,
    total_records: 0,
    day_of_week: [],
    time_slots: [],
    weekly: [],
    monthly: [],
    subjects: [],
    faculty: [],
    class_ranking: [],
    most_absent: [],
  }
}
