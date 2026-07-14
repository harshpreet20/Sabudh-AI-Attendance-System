import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

// GET: the student's overall coverage of the lecture's pre-class material —
// distinct slides viewed / total slides, aggregated across all materials.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: rows } = await service
      .from('material_slide_progress')
      .select('viewed, total')
      .eq('session_id', id).eq('user_id', user.id)

    let viewed = 0, total = 0
    for (const r of rows || []) { viewed += (r.viewed || []).length; total += r.total || 0 }
    const pct = total > 0 ? Math.round((viewed / total) * 100) : 0
    return NextResponse.json({ success: true, data: { viewed, total, pct } })
  } catch (error) {
    console.error('[lecture coverage] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
