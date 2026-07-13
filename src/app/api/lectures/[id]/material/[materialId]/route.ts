import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

// Secure content delivery for a lecture material: authorizes the viewer, then
// returns a short-lived signed URL to stream/render in-app. No permanent/public
// URL is handed to the student and the UI exposes no download control.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  try {
    const { id, materialId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: material } = await service
      .from('course_materials')
      .select('id, session_id, bucket, storage_path, file_type, file_name')
      .eq('id', materialId)
      .maybeSingle()

    if (!material || material.session_id !== id || !material.storage_path) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
    }

    const bucket = material.bucket || 'uploads'
    const { data: signed, error } = await service.storage.from(bucket).createSignedUrl(material.storage_path, 300)
    if (error || !signed) {
      return NextResponse.json({ success: false, error: { code: 'SIGN_FAILED', message: 'Could not prepare content' } }, { status: 500 })
    }

    // Audit access to secure content.
    await service.from('audit_logs').insert({
      actor_id: user.id,
      action: 'lecture_material_viewed',
      target_table: 'course_materials',
      target_id: materialId,
    }).then(() => {}, () => {})

    return NextResponse.json({
      success: true,
      data: { url: signed.signedUrl, file_type: material.file_type, file_name: material.file_name, expires_in: 300 },
    })
  } catch (error) {
    console.error('[lectures material] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
