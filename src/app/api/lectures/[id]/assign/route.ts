import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

// Staff: attach or detach a material to/from this lecture. Also lists the
// batch's materials so staff can pick which belong to the lecture.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const service = createServiceClient()
  const access = await getLectureAccess(service, id, user.id)
  if (!access.ok || !access.isStaff || !access.session?.batch_id) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  const { data: materials } = await service
    .from('course_materials')
    .select('id, title, file_name, file_type, session_id')
    .eq('batch_id', access.session.batch_id)
    .order('sort_order', { ascending: true })

  return NextResponse.json({ success: true, data: { materials: materials || [] } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const service = createServiceClient()
  const access = await getLectureAccess(service, id, user.id)
  if (!access.ok || !access.isStaff) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  const { material_id, attach } = await request.json()
  if (!material_id) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR' } }, { status: 400 })

  // Only allow attaching materials from the same batch.
  const { data: material } = await service
    .from('course_materials')
    .select('id, batch_id')
    .eq('id', material_id)
    .maybeSingle()
  if (!material || material.batch_id !== access.session?.batch_id) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Material not in this batch' } }, { status: 404 })
  }

  await service
    .from('course_materials')
    .update({ session_id: attach === false ? null : id })
    .eq('id', material_id)

  return NextResponse.json({ success: true })
}
