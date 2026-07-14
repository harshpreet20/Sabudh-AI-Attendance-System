import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isConvertible, conversionConfigured, convertToPdf } from '@/lib/doc-convert'

// Converts a PPT/DOC material to a secure interactive PDF via the LibreOffice
// worker and stores the result in the private lecture-content bucket. Staff only.
// Degrades gracefully when the worker isn't configured.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (!['instructor', 'admin', 'super_admin'].includes(role?.role || '')) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
    }

    const service = createServiceClient()
    const { data: material } = await service
      .from('course_materials')
      .select('id, bucket, storage_path, file_type, file_name, conversion_status, session_id')
      .eq('id', id)
      .maybeSingle()

    if (!material || !material.storage_path) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
    }
    if (!isConvertible(material.file_type, material.file_name)) {
      return NextResponse.json({ success: true, data: { status: 'skipped', reason: 'Not an office document' } })
    }
    if (!conversionConfigured()) {
      return NextResponse.json({ success: true, data: { status: 'unconfigured', reason: 'Conversion worker not configured' } })
    }

    await service.from('course_materials').update({ conversion_status: 'converting', conversion_error: null }).eq('id', id)

    try {
      // Signed URL for the worker to download the original.
      const srcBucket = material.bucket || 'uploads'
      const { data: signed, error: signErr } = await service.storage.from(srcBucket).createSignedUrl(material.storage_path, 300)
      if (signErr || !signed) throw new Error('Could not read source file')

      const pdf = await convertToPdf(signed.signedUrl, material.file_name || 'document')

      const outPath = `converted/${id}.pdf`
      const { error: upErr } = await service.storage
        .from('lecture-content')
        .upload(outPath, pdf, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      await service
        .from('course_materials')
        .update({ converted_pdf_path: outPath, converted_bucket: 'lecture-content', conversion_status: 'done', conversion_error: null })
        .eq('id', id)

      // Now that the office file is readable, auto-build the interactive study
      // content so the lecture is immersive the moment a student opens it.
      if (material.session_id) {
        try {
          const { prepareLectureContent } = await import('@/lib/lecture-prepare')
          await prepareLectureContent(service, material.session_id, { force: true, generatedBy: user.id })
        } catch (e) {
          console.error('[convert] prepare error:', e)
        }
      }

      return NextResponse.json({ success: true, data: { status: 'done' } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed'
      await service.from('course_materials').update({ conversion_status: 'failed', conversion_error: message }).eq('id', id)
      return NextResponse.json({ success: false, error: { code: 'CONVERT_FAILED', message } }, { status: 502 })
    }
  } catch (error) {
    console.error('[materials/convert] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
