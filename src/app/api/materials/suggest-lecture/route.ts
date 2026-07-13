import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { heuristicMatch, type LectureCandidate } from '@/lib/lecture-match'

// Suggests which lecture an uploaded material belongs to. Cost-optimized:
// a local heuristic resolves the common cases (explicit "Lecture 3", "week5",
// filename<->topic word overlap) for FREE, and OpenAI (gpt-4o-mini, tiny prompt,
// filename + topic list only — never file contents) is used only when the
// heuristic is inconclusive. The teacher can always override the result.

interface Candidate extends LectureCandidate { date: string }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const { data: roleRow } = await service.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (!['instructor', 'admin', 'super_admin'].includes(roleRow?.role || '')) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
    }

    const body = await request.json()
    const batchId: string = body.batch_id
    const fileName: string = (body.file_name || body.title || '').toString()
    if (!batchId || !fileName.trim()) {
      return NextResponse.json({ success: true, data: { session_id: null, via: 'none' } })
    }

    const { data: sessions } = await service
      .from('sessions')
      .select('id, session_date, topic_taught, status')
      .eq('batch_id', batchId)
      .in('status', ['attendance_open', 'attendance_closed', 'completed'])
      .order('session_date', { ascending: false })
      .limit(200)

    const list = sessions || []
    if (list.length === 0) return NextResponse.json({ success: true, data: { session_id: null, via: 'none' } })

    // Number lectures oldest-first so "Lecture N" is stable (matches the list view).
    const ordered = [...list].sort((a, b) => a.session_date.localeCompare(b.session_date))
    const candidates: Candidate[] = ordered.map((s, i) => ({ id: s.id, number: i + 1, date: s.session_date, topic: s.topic_taught || '' }))
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const labelFor = (c: Candidate) =>
      `Lecture ${String(c.number).padStart(2, '0')}${c.topic ? ` · ${c.topic}` : ''}`

    // 1+2) Free heuristic (explicit number, then filename<->topic overlap).
    const heuristic = heuristicMatch(fileName, candidates)
    if (heuristic) {
      const hit = byId.get(heuristic.session_id)!
      return NextResponse.json({ success: true, data: { session_id: hit.id, label: labelFor(hit), confidence: heuristic.confidence, via: 'heuristic' } })
    }

    // 3) AI fallback — only when the heuristic couldn't decide. Tiny prompt:
    // just the filename + a compact topic list, capped to bound tokens/cost.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: true, data: { session_id: null, via: 'none' } })
    }
    const capped = candidates.filter((c) => c.topic).slice(-40) // recent, topic-bearing
    if (capped.length === 0) return NextResponse.json({ success: true, data: { session_id: null, via: 'none' } })

    try {
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const menu = capped.map((c, i) => `${i}) ${c.topic}`).join('\n')
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `A course file is named: "${fileName}".\nWhich lecture topic does it most likely belong to? Reply JSON {"index": <number or -1 if none clearly match>}.\n\nTOPICS:\n${menu}`,
        }],
        max_tokens: 20,
        temperature: 0,
        response_format: { type: 'json_object' },
      })
      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
      const idx = typeof parsed.index === 'number' ? parsed.index : -1
      if (idx >= 0 && idx < capped.length) {
        const hit = capped[idx]
        return NextResponse.json({ success: true, data: { session_id: hit.id, label: labelFor(hit), confidence: 'low', via: 'ai' } })
      }
    } catch (e) {
      console.error('[suggest-lecture] AI error:', e)
    }

    return NextResponse.json({ success: true, data: { session_id: null, via: 'none' } })
  } catch (error) {
    console.error('[suggest-lecture] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
