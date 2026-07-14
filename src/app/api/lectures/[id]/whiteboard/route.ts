import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { gatherLectureContext } from '@/lib/lectures'

// Ensure a board exists for the lecture and return its current state.
async function ensureBoard(service: ReturnType<typeof createServiceClient>, sessionId: string, userId: string): Promise<string> {
  const { data: existing } = await service.from('whiteboards').select('id').eq('session_id', sessionId).maybeSingle()
  if (existing) return existing.id
  const { data: created } = await service
    .from('whiteboards')
    .insert({ session_id: sessionId, created_by: userId })
    .select('id')
    .single()
  return created!.id
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const boardId = await ensureBoard(service, id, user.id)
    const { data: elements } = await service
      .from('whiteboard_elements')
      .select('id, kind, data, z')
      .eq('board_id', boardId)
      .eq('deleted', false)
      .order('z', { ascending: true })

    return NextResponse.json({ success: true, data: { board_id: boardId, elements: elements || [], is_staff: access.isStaff } })
  } catch (error) {
    console.error('[whiteboard] GET error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}

// POST: AI diagram — the Whiteboard Agent turns the lecture into a mind map and
// lays it onto the board as sticky notes + connectors.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: { code: 'AI_UNCONFIGURED', message: 'AI is not configured.' } }, { status: 503 })
    }

    const boardId = await ensureBoard(service, id, user.id)
    const { context } = await gatherLectureContext(service, id)
    const material = context && context.length > 20 ? context : `Lecture topic: ${access.session?.topic_taught || 'this lecture'}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    let mind: { central?: string; nodes?: Array<{ label: string }> } = {}
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `From the lecture material, produce a mind map for a whiteboard. Return JSON {"central":"<central topic, <=5 words>","nodes":[{"label":"<key idea, <=6 words>"}]} with 5-8 nodes.\n\nMATERIAL:\n${material.slice(0, 5000)}`,
        }],
        max_tokens: 400,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      })
      mind = JSON.parse(res.choices[0]?.message?.content || '{}')
    } catch {
      mind = {}
    }

    const central = mind.central || access.session?.topic_taught || 'Lecture'
    const nodes = (mind.nodes || []).slice(0, 8)

    // Radial layout around a central sticky.
    const cx = 600, cy = 360
    const ops: Array<{ id: string; kind: string; data: Record<string, unknown>; z: number }> = []
    const centralId = crypto.randomUUID()
    ops.push({ id: centralId, kind: 'sticky', data: { x: cx - 80, y: cy - 40, w: 160, h: 80, text: central, color: '#6366f1' }, z: 1 })
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2
      const x = cx + Math.cos(angle) * 280 - 70
      const y = cy + Math.sin(angle) * 220 - 35
      const nid = crypto.randomUUID()
      ops.push({ id: nid, kind: 'sticky', data: { x, y, w: 140, h: 70, text: n.label, color: '#f59e0b', from: centralId }, z: 2 })
    })

    const now = new Date().toISOString()
    for (const op of ops) {
      await service.from('whiteboard_elements').insert({ id: op.id, board_id: boardId, kind: op.kind, data: op.data, z: op.z, updated_by: user.id, updated_at: now })
      await service.from('whiteboard_events').insert({ board_id: boardId, op: 'add', element_id: op.id, data: op.data, actor: user.id })
    }

    return NextResponse.json({ success: true, data: { board_id: boardId, elements: ops } })
  } catch (error) {
    console.error('[whiteboard] AI error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
