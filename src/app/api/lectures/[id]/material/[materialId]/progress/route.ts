import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

function pct(viewed: number, total: number) { return total > 0 ? Math.round((viewed / total) * 100) : 0 }

// GET: this student's coverage of the material (viewed distinct slides / total).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  try {
    const { id, materialId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: row } = await service
      .from('material_slide_progress')
      .select('viewed, total')
      .eq('material_id', materialId).eq('user_id', user.id)
      .maybeSingle()
    const viewed = (row?.viewed || []).length
    const total = row?.total || 0
    return NextResponse.json({ success: true, data: { viewed, total, pct: pct(viewed, total) } })
  } catch (error) {
    console.error('[material progress] GET error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}

// POST { slide, total }: record that the student viewed a slide (1-indexed).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; materialId: string }> }) {
  try {
    const { id, materialId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const slide = Number(body.slide)
    const total = Math.max(0, Number(body.total) || 0)
    if (!Number.isFinite(slide) || slide < 1) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR' } }, { status: 400 })
    }

    const { data: existing } = await service
      .from('material_slide_progress')
      .select('viewed, total')
      .eq('material_id', materialId).eq('user_id', user.id)
      .maybeSingle()

    const set = new Set<number>(existing?.viewed || [])
    set.add(slide)
    const viewed = Array.from(set).filter((n) => n >= 1 && (total === 0 || n <= total)).sort((a, b) => a - b)
    const newTotal = Math.max(total, existing?.total || 0)

    await service.from('material_slide_progress').upsert({
      material_id: materialId, session_id: id, user_id: user.id, student_id: access.studentProfileId,
      viewed, total: newTotal, updated_at: new Date().toISOString(),
    }, { onConflict: 'material_id,user_id' })

    return NextResponse.json({ success: true, data: { viewed: viewed.length, total: newTotal, pct: pct(viewed.length, newTotal) } })
  } catch (error) {
    console.error('[material progress] POST error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
