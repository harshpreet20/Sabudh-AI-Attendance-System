import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { gatherLectureContext, generateSummary, generateTakeaways, generateQuiz } from './lectures'

const KINDS = ['summary', 'takeaways', 'quiz'] as const

export interface PrepareResult {
  ok: boolean
  skipped?: 'no_openai' | 'no_content'
  generated: string[]
}

// Pre-builds the interactive study content (summary, key takeaways, practice
// quiz) for a lecture so it is ready the instant a student opens it — no waiting,
// no per-student token spend. Content is generated once and shared. It is
// regenerated only when material is newer than the cached content (so the "last
// uploaded" material is reflected), unless `force` is set. Safe to call
// fire-and-forget; it no-ops when there's no readable material yet.
export async function prepareLectureContent(
  service: SupabaseClient,
  sessionId: string,
  opts: { force?: boolean; generatedBy?: string } = {},
): Promise<PrepareResult> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, skipped: 'no_openai', generated: [] }

  const { context } = await gatherLectureContext(service, sessionId)
  if (!context || context.length < 40) return { ok: false, skipped: 'no_content', generated: [] }

  // Newest material change — used to decide whether cached content is stale.
  const { data: mats } = await service
    .from('course_materials')
    .select('updated_at')
    .eq('session_id', sessionId)
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestMaterialAt = mats?.[0]?.updated_at ? new Date(mats[0].updated_at).getTime() : 0

  const { data: existing } = await service
    .from('lecture_ai_content')
    .select('kind, created_at')
    .eq('session_id', sessionId)
    .eq('difficulty', 'standard')
  const cachedAt = new Map((existing || []).map((r) => [r.kind as string, new Date(r.created_at).getTime()]))

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const generated: string[] = []

  for (const kind of KINDS) {
    const at = cachedAt.get(kind)
    const stale = opts.force || at == null || at < latestMaterialAt
    if (!stale) continue

    const payload =
      kind === 'summary'
        ? await generateSummary(openai, context, 'standard')
        : kind === 'takeaways'
          ? await generateTakeaways(openai, context, 'standard')
          : await generateQuiz(openai, context, 'standard')
    if (!payload) continue

    await service.from('lecture_ai_content').upsert(
      {
        session_id: sessionId,
        kind,
        difficulty: 'standard',
        payload,
        model: 'gpt-4o-mini',
        ...(opts.generatedBy ? { generated_by: opts.generatedBy } : {}),
      },
      { onConflict: 'session_id,kind,difficulty' },
    )
    generated.push(kind)
  }

  return { ok: true, generated }
}
