import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Lists "Previous Classes" — completed lectures for a batch. Students see their
// own batch; staff can pass ?batch_id=. Each entry carries the material count,
// whether AI content exists, and (for students) their attendance for that class.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: roleRow } = await service.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    const isStaff = ['instructor', 'admin', 'super_admin'].includes(roleRow?.role || '')

    let batchId = new URL(request.url).searchParams.get('batch_id')
    let studentProfileId: string | null = null

    if (!isStaff) {
      const { data: profile } = await service
        .from('student_profiles')
        .select('id, batch_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile?.batch_id) {
        return NextResponse.json({ success: true, data: { lectures: [] } })
      }
      batchId = profile.batch_id
      studentProfileId = profile.id
    }

    let sessionQuery = service
      .from('sessions')
      .select('id, batch_id, instructor_id, session_date, status, topic_taught, batches(name)')
      .in('status', ['attendance_open', 'attendance_closed', 'completed'])
      .order('session_date', { ascending: false })
      .limit(200)
    if (batchId) sessionQuery = sessionQuery.eq('batch_id', batchId)

    const { data: sessions } = await sessionQuery
    const list = sessions || []
    if (list.length === 0) return NextResponse.json({ success: true, data: { lectures: [] } })

    const sessionIds = list.map((s) => s.id)
    const instructorIds = Array.from(new Set(list.map((s) => s.instructor_id).filter(Boolean))) as string[]

    const [{ data: materials }, { data: aiRows }, { data: teachers }, attendanceRes] = await Promise.all([
      service.from('course_materials').select('session_id').in('session_id', sessionIds),
      service.from('lecture_ai_content').select('session_id').in('session_id', sessionIds),
      instructorIds.length ? service.from('teacher_profiles').select('auth_user_id, full_name').in('auth_user_id', instructorIds) : Promise.resolve({ data: [] }),
      studentProfileId
        ? service.from('attendance').select('session_id, status').eq('student_id', studentProfileId).in('session_id', sessionIds)
        : Promise.resolve({ data: [] }),
    ])

    const materialCount = new Map<string, number>()
    for (const m of materials || []) if (m.session_id) materialCount.set(m.session_id, (materialCount.get(m.session_id) || 0) + 1)
    const hasAi = new Set((aiRows || []).map((a) => a.session_id))
    const teacherName = new Map((teachers || []).map((t) => [t.auth_user_id, t.full_name]))
    const attendanceMap = new Map((attendanceRes.data || []).map((a) => [a.session_id, a.status]))

    // Number lectures oldest-first for stable "Lecture N" labels.
    const ordered = [...list].sort((a, b) => a.session_date.localeCompare(b.session_date))
    const lectureNumber = new Map(ordered.map((s, i) => [s.id, i + 1]))

    const lectures = list.map((s) => {
      const batchArr = s.batches as unknown as { name: string }[] | { name: string } | null
      const batch = Array.isArray(batchArr) ? batchArr[0] : batchArr
      const attStatus = attendanceMap.get(s.id)
      return {
        id: s.id,
        number: lectureNumber.get(s.id) ?? null,
        title: s.topic_taught || 'Lecture',
        date: s.session_date,
        batch_name: batch?.name ?? null,
        teacher_name: s.instructor_id ? teacherName.get(s.instructor_id) ?? null : null,
        material_count: materialCount.get(s.id) || 0,
        has_ai: hasAi.has(s.id),
        attendance: attStatus ? (['approved', 'excused'].includes(attStatus) ? 'present' : attStatus) : studentProfileId ? 'absent' : null,
      }
    })

    return NextResponse.json({ success: true, data: { lectures, is_staff: isStaff } })
  } catch (error) {
    console.error('[lectures] list error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
