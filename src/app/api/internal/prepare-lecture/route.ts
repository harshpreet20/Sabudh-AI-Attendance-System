import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { prepareLectureContent } from '@/lib/lecture-prepare'

export const maxDuration = 60

// Internal, machine-to-machine endpoint called by the database (pg_net) whenever
// lecture material changes — so the interactive study content is built in the
// BACKGROUND, on the server, and cached before any student opens the lecture,
// completely independent of whoever uploaded it. Authenticated by a shared
// secret (never a user session). No-ops safely until the secret is configured.
function authorized(request: NextRequest): boolean {
  const secret = process.env.PREP_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token.length > 0 && token === secret
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const sessionId: string | undefined = body.session_id
    if (!sessionId) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'session_id required' } }, { status: 400 })
    }

    const service = createServiceClient()
    after(async () => {
      try {
        // Staleness-driven (no force) so multiple triggers never double-spend.
        await prepareLectureContent(service, sessionId)
      } catch (e) {
        console.error('[internal/prepare-lecture] background error:', e)
      }
    })

    return NextResponse.json({ success: true, data: { queued: true } }, { status: 202 })
  } catch (error) {
    console.error('[internal/prepare-lecture] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
