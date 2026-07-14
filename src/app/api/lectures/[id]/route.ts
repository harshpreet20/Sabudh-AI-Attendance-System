import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

// Full workspace bundle for one lecture: materials, teacher notes, this user's
// personal notes, cached AI content, discussion count.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok || !access.session) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this lecture' } }, { status: 403 })
    }

    const [{ data: materials }, { data: teacherNotes }, { data: personalNotes }, { data: ai }, discussionRes, { data: instructor }] =
      await Promise.all([
        service
          .from('course_materials')
          .select('id, title, file_name, file_type, sort_order')
          .eq('session_id', id)
          .order('sort_order', { ascending: true }),
        service.from('lecture_notes').select('content, updated_at').eq('session_id', id).maybeSingle(),
        service.from('lecture_personal_notes').select('content, updated_at').eq('session_id', id).eq('user_id', user.id).maybeSingle(),
        service.from('lecture_ai_content').select('kind, difficulty, payload, created_at').eq('session_id', id),
        service.from('discussion_threads').select('id', { count: 'exact', head: true }).eq('session_id', id),
        access.session.instructor_id
          ? service.from('teacher_profiles').select('full_name').eq('auth_user_id', access.session.instructor_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    const aiByKind: Record<string, { difficulty: string; payload: unknown; created_at: string }> = {}
    for (const row of ai || []) {
      // Prefer the most recent per kind.
      if (!aiByKind[row.kind] || row.created_at > aiByKind[row.kind].created_at) {
        aiByKind[row.kind] = { difficulty: row.difficulty, payload: row.payload, created_at: row.created_at }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lecture: {
          id: access.session.id,
          title: access.session.topic_taught || 'Lecture',
          date: access.session.session_date,
          teacher_name: (instructor as { full_name?: string } | null)?.full_name ?? null,
        },
        is_staff: access.isStaff,
        materials: materials || [],
        teacher_notes: teacherNotes?.content || '',
        personal_notes: personalNotes?.content || '',
        ai: aiByKind,
        discussion_count: discussionRes.count || 0,
      },
    })
  } catch (error) {
    console.error('[lectures/:id] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
