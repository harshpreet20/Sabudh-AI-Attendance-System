import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { extractPptxSlides } from '@/lib/pptx'

export const maxDuration = 60

function isPptx(fileName: string | null, fileType: string | null): boolean {
  return /\.pptx?$/i.test(fileName || '') || /presentationml|powerpoint/i.test(fileType || '')
}

// Turns a PowerPoint into an interactive slide deck (text + images) server-side,
// so it renders in-browser with no external converter and the raw .pptx never
// reaches the student. Result is cached on the material for instant re-views.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  try {
    const { id, materialId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: material } = await service
      .from('course_materials')
      .select('id, session_id, bucket, storage_path, file_type, file_name, extracted')
      .eq('id', materialId)
      .maybeSingle()

    if (!material || material.session_id !== id || !material.storage_path) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
    }
    if (!isPptx(material.file_name, material.file_type)) {
      return NextResponse.json({ success: false, error: { code: 'UNSUPPORTED', message: 'Not a PowerPoint file' } }, { status: 415 })
    }

    // Serve cached extraction when available.
    if (material.extracted && typeof material.extracted === 'object') {
      return NextResponse.json({ success: true, data: { ...material.extracted, cached: true } })
    }

    const { data: blob, error: dlErr } = await service.storage.from(material.bucket || 'uploads').download(material.storage_path)
    if (dlErr || !blob) {
      return NextResponse.json({ success: false, error: { code: 'DOWNLOAD_FAILED', message: 'Could not read the file' } }, { status: 500 })
    }

    const deck = await extractPptxSlides(new Uint8Array(await blob.arrayBuffer()))
    if (deck.slide_count === 0) {
      return NextResponse.json({ success: false, error: { code: 'EMPTY', message: 'No slides could be read from this file.' } }, { status: 422 })
    }

    await service.from('course_materials').update({ extracted: deck }).eq('id', materialId).then(() => {}, () => {})

    return NextResponse.json({ success: true, data: { ...deck, cached: false } })
  } catch (error) {
    console.error('[material slides] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not build the slide view.' } }, { status: 500 })
  }
}
