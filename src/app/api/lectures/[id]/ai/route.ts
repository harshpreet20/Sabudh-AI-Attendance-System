import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { gatherLectureContext, generateSummary, generateTakeaways, generateQuiz } from '@/lib/lectures'

const KINDS = ['summary', 'takeaways', 'quiz'] as const
const DIFFICULTIES = ['easy', 'standard', 'hard']

// Generate (or regenerate) AI learning content for a lecture and cache it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await request.json().catch(() => ({}))
    const kind = body.kind as (typeof KINDS)[number]
    const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'standard'
    const force = !!body.force
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid kind' } }, { status: 400 })
    }

    // Serve cache unless regeneration is requested.
    if (!force) {
      const { data: cached } = await service
        .from('lecture_ai_content')
        .select('payload')
        .eq('session_id', id)
        .eq('kind', kind)
        .eq('difficulty', difficulty)
        .maybeSingle()
      if (cached) return NextResponse.json({ success: true, data: { payload: cached.payload, cached: true } })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: { code: 'AI_UNCONFIGURED', message: 'AI is not configured (OPENAI_API_KEY missing).' } }, { status: 503 })
    }

    const { context, sources } = await gatherLectureContext(service, id)
    if (!context || context.length < 40) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_CONTENT', message: 'No readable lecture material yet. Upload a PDF/notes for this lecture first.' } },
        { status: 400 },
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const payload =
      kind === 'summary'
        ? await generateSummary(openai, context, difficulty)
        : kind === 'takeaways'
          ? await generateTakeaways(openai, context, difficulty)
          : await generateQuiz(openai, context, difficulty)

    if (!payload) {
      return NextResponse.json({ success: false, error: { code: 'AI_FAILED', message: 'AI generation failed. Try again.' } }, { status: 502 })
    }

    await service
      .from('lecture_ai_content')
      .upsert(
        { session_id: id, kind, difficulty, payload, model: 'gpt-4o-mini', generated_by: user.id },
        { onConflict: 'session_id,kind,difficulty' },
      )

    return NextResponse.json({ success: true, data: { payload, sources, cached: false } })
  } catch (error) {
    console.error('[lectures/:id/ai] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
