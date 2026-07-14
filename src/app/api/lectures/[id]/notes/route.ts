import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

// PUT { scope: 'teacher' | 'personal', content }.
// Teacher notes are lecture-wide (staff only); personal notes are per-user.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const body = await request.json()
    const scope = body.scope as 'teacher' | 'personal'
    const content = typeof body.content === 'string' ? body.content : ''

    if (scope === 'teacher') {
      if (!access.isStaff) {
        return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
      }
      await service
        .from('lecture_notes')
        .upsert({ session_id: id, content, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'session_id' })
      return NextResponse.json({ success: true })
    }

    if (scope === 'personal') {
      await service
        .from('lecture_personal_notes')
        .upsert({ session_id: id, user_id: user.id, content, updated_at: new Date().toISOString() }, { onConflict: 'session_id,user_id' })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid scope' } }, { status: 400 })
  } catch (error) {
    console.error('[lectures/:id/notes] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
