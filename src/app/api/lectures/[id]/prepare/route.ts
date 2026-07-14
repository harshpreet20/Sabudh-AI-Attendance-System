import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { prepareLectureContent } from '@/lib/lecture-prepare'

// Allow up to a minute for the (backgrounded) AI generation.
export const maxDuration = 60

// Staff-triggered (typically fire-and-forget after an upload): pre-build the
// lecture's interactive study content so students find it ready and instant.
// The response returns immediately; generation runs in the background via
// after() so it never blocks the upload or times out the client.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok || !access.isStaff) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const force = !!body.force

    after(async () => {
      try {
        await prepareLectureContent(service, id, { force, generatedBy: user.id })
      } catch (e) {
        console.error('[lectures/:id/prepare] background error:', e)
      }
    })

    return NextResponse.json({ success: true, data: { queued: true } }, { status: 202 })
  } catch (error) {
    console.error('[lectures/:id/prepare] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
