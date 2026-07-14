import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'

const DEFAULT_THRESHOLD = 75
const ACCEPTED_STATUSES = new Set(['approved', 'excused', 'uploaded', 'processing'])

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// AI-powered attendance intelligence: surfaces actionable, rule-derived
// insights (below threshold, consecutive absences, subject/faculty drops) and,
// when an OpenAI key is present, an executive natural-language summary.
export async function GET() {
  try {
    await requireAdmin()
    const supabase = createServiceClient()

    const { data: students } = await supabase
      .from('student_profiles')
      .select('id, full_name, batch_id, attendance_percentage, present_count, absent_count, total_sessions')
      .eq('status', 'active')

    const roster = students || []
    const threshold = DEFAULT_THRESHOLD

    // --- Rule-based insights -------------------------------------------------
    const belowThreshold = roster
      .filter((s) => s.total_sessions > 0 && Number(s.attendance_percentage) < threshold)
      .sort((a, b) => Number(a.attendance_percentage) - Number(b.attendance_percentage))
      .map((s) => ({
        student_id: s.id,
        name: s.full_name,
        attendance: Number(Number(s.attendance_percentage).toFixed(1)),
      }))

    // Consecutive absences (last 5 sessions per batch).
    const consecutive = await consecutiveAbsentees(roster.map((s) => ({ id: s.id, batch_id: s.batch_id, name: s.full_name })))

    // Subject & faculty drops.
    const { subjectDrops, facultyDrops } = await computeDrops(supabase)

    const insights = {
      generated_at: new Date().toISOString(),
      threshold,
      below_threshold: {
        count: belowThreshold.length,
        students: belowThreshold.slice(0, 25),
      },
      consecutive_absences: {
        count: consecutive.length,
        students: consecutive.slice(0, 25),
      },
      subject_drops: subjectDrops,
      faculty_drops: facultyDrops,
    }

    // --- AI executive summary (optional) ------------------------------------
    let summary: string | null = null
    if (process.env.OPENAI_API_KEY) {
      try {
        summary = await generateSummary(insights, roster.length)
      } catch (err) {
        console.error('[admin/insights] OpenAI summary failed:', err instanceof Error ? err.message : err)
      }
    }

    if (!summary) summary = fallbackSummary(insights, roster.length)

    return NextResponse.json({ success: true, data: { ...insights, summary, ai_generated: !!process.env.OPENAI_API_KEY && summary !== fallbackSummary(insights, roster.length) } })
  } catch (error) {
    console.error('[admin/insights] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to build insights' } },
      { status: 500 },
    )
  }
}

async function consecutiveAbsentees(
  students: Array<{ id: string; batch_id: string | null; name: string }>,
): Promise<Array<{ student_id: string; name: string; streak: number }>> {
  const supabase = createServiceClient()
  const batchIds = Array.from(new Set(students.map((s) => s.batch_id).filter(Boolean))) as string[]
  if (batchIds.length === 0) return []

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, batch_id, session_date')
    .in('batch_id', batchIds)
    .in('status', ['attendance_open', 'attendance_closed', 'completed'])
    .order('session_date', { ascending: false })
    .limit(300)

  const recentByBatch = new Map<string, string[]>()
  for (const s of sessions || []) {
    if (!s.batch_id) continue
    const arr = recentByBatch.get(s.batch_id) ?? []
    if (arr.length < 5) arr.push(s.id)
    recentByBatch.set(s.batch_id, arr)
  }

  const sessionIds = Array.from(recentByBatch.values()).flat()
  if (sessionIds.length === 0) return []

  const { data: attendance } = await supabase
    .from('attendance')
    .select('session_id, student_id, status')
    .in('session_id', sessionIds)

  const presentBySession = new Map<string, Set<string>>()
  for (const a of attendance || []) {
    if (!ACCEPTED_STATUSES.has(a.status)) continue
    const set = presentBySession.get(a.session_id) ?? new Set<string>()
    set.add(a.student_id)
    presentBySession.set(a.session_id, set)
  }

  const out: Array<{ student_id: string; name: string; streak: number }> = []
  for (const student of students) {
    if (!student.batch_id) continue
    const batchSessions = recentByBatch.get(student.batch_id) ?? []
    let streak = 0
    for (const sid of batchSessions) {
      if (presentBySession.get(sid)?.has(student.id)) break
      streak++
    }
    if (streak >= 2) out.push({ student_id: student.id, name: student.name, streak })
  }
  return out.sort((a, b) => b.streak - a.streak)
}

async function computeDrops(supabase: ReturnType<typeof createServiceClient>) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, batch_id, instructor_id, session_date, batches(name, instructor_id, courses(title))')
    .gte('session_date', since)
    .in('status', ['attendance_closed', 'completed'])

  if (!sessions || sessions.length === 0) return { subjectDrops: [], facultyDrops: [] }

  const { data: attendance } = await supabase
    .from('attendance')
    .select('session_id, status')
    .in('session_id', sessions.map((s) => s.id))

  const acceptedBySession = new Map<string, number>()
  for (const a of attendance || []) {
    if (!ACCEPTED_STATUSES.has(a.status)) continue
    acceptedBySession.set(a.session_id, (acceptedBySession.get(a.session_id) ?? 0) + 1)
  }

  // Aggregate present counts per subject & faculty over the window.
  const subj = new Map<string, { name: string; present: number; sessions: number }>()
  const fac = new Map<string, { name: string; present: number; sessions: number }>()

  for (const s of sessions) {
    const batch = s.batches as unknown as { name: string; instructor_id: string | null; courses: { title: string }[] | { title: string } | null } | null
    const courseArr = batch?.courses
    const course = Array.isArray(courseArr) ? courseArr[0] : courseArr
    const present = acceptedBySession.get(s.id) ?? 0

    const subjectName = course?.title || 'Unknown subject'
    const subjEntry = subj.get(subjectName) ?? { name: subjectName, present: 0, sessions: 0 }
    subjEntry.present += present
    subjEntry.sessions += 1
    subj.set(subjectName, subjEntry)

    const instructorId = s.instructor_id || batch?.instructor_id || 'unassigned'
    const facEntry = fac.get(instructorId) ?? { name: instructorId, present: 0, sessions: 0 }
    facEntry.present += present
    facEntry.sessions += 1
    fac.set(instructorId, facEntry)
  }

  const subjectDrops = Array.from(subj.values())
    .map((e) => ({ name: e.name, avg_present_per_session: Number((e.present / Math.max(1, e.sessions)).toFixed(1)), sessions: e.sessions }))
    .sort((a, b) => a.avg_present_per_session - b.avg_present_per_session)
    .slice(0, 5)

  // Resolve faculty names.
  const facultyIds = Array.from(fac.keys()).filter((k) => k !== 'unassigned')
  const { data: teachers } = facultyIds.length
    ? await supabase.from('teacher_profiles').select('auth_user_id, full_name').in('auth_user_id', facultyIds)
    : { data: [] }
  const teacherMap = new Map((teachers || []).map((t) => [t.auth_user_id, t.full_name]))

  const facultyDrops = Array.from(fac.values())
    .map((e) => ({
      name: e.name === 'unassigned' ? 'Unassigned' : teacherMap.get(e.name) || 'Instructor',
      avg_present_per_session: Number((e.present / Math.max(1, e.sessions)).toFixed(1)),
      sessions: e.sessions,
    }))
    .sort((a, b) => a.avg_present_per_session - b.avg_present_per_session)
    .slice(0, 5)

  return { subjectDrops, facultyDrops }
}

interface InsightsShape {
  threshold: number
  below_threshold: { count: number; students: Array<{ name: string; attendance: number }> }
  consecutive_absences: { count: number; students: Array<{ name: string; streak: number }> }
  subject_drops: Array<{ name: string; avg_present_per_session: number }>
  faculty_drops: Array<{ name: string; avg_present_per_session: number }>
}

async function generateSummary(insights: InsightsShape, totalStudents: number): Promise<string> {
  const openai = getOpenAI()
  const prompt = `You are an attendance analytics assistant for an education platform. Given the JSON data below, write a concise (max 6 sentences) executive summary for an administrator. Highlight the most urgent issues, name a few specific at-risk students, and end with 2-3 concrete recommended interventions. Be direct and factual.

Total active students: ${totalStudents}
Attendance threshold: ${insights.threshold}%

Data:
${JSON.stringify(insights)}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.4,
  })
  return completion.choices[0]?.message?.content?.trim() || fallbackSummary(insights, totalStudents)
}

function fallbackSummary(insights: InsightsShape, totalStudents: number): string {
  const parts: string[] = []
  parts.push(`${insights.below_threshold.count} of ${totalStudents} active students are below the ${insights.threshold}% attendance threshold.`)
  if (insights.consecutive_absences.count > 0) {
    parts.push(`${insights.consecutive_absences.count} students have missed 2+ sessions in a row.`)
  }
  if (insights.below_threshold.students.length > 0) {
    const names = insights.below_threshold.students.slice(0, 3).map((s) => `${s.name} (${s.attendance}%)`).join(', ')
    parts.push(`Lowest attendance: ${names}.`)
  }
  if (insights.subject_drops.length > 0) {
    parts.push(`Weakest subject turnout: ${insights.subject_drops[0].name}.`)
  }
  parts.push('Recommended: send low-attendance warnings, schedule 1:1 check-ins with consecutive absentees, and review scheduling for low-turnout subjects.')
  return parts.join(' ')
}
