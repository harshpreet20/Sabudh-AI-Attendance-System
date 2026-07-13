import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'

interface Op {
  type: 'add' | 'update' | 'delete' | 'clear'
  element?: { id: string; kind?: string; data?: Record<string, unknown>; z?: number }
}

async function authorizeBoard(service: ReturnType<typeof createServiceClient>, boardId: string, userId: string) {
  const { data: board } = await service.from('whiteboards').select('id, session_id').eq('id', boardId).maybeSingle()
  if (!board?.session_id) return { ok: false, isStaff: false }
  const access = await getLectureAccess(service, board.session_id, userId)
  return { ok: access.ok, isStaff: access.isStaff }
}

// GET ?replay=1 -> ordered event log for replay.
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const { boardId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const auth = await authorizeBoard(service, boardId, user.id)
    if (!auth.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: events } = await service
      .from('whiteboard_events')
      .select('id, op, element_id, data, created_at')
      .eq('board_id', boardId)
      .order('id', { ascending: true })
      .limit(5000)

    return NextResponse.json({ success: true, data: { events: events || [] } })
  } catch (error) {
    console.error('[whiteboards/:id] GET error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}

// POST { ops: Op[] } -> persist current state + append to the replay log.
export async function POST(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const { boardId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const auth = await authorizeBoard(service, boardId, user.id)
    if (!auth.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const body = await request.json()
    const ops: Op[] = Array.isArray(body.ops) ? body.ops.slice(0, 200) : []
    const now = new Date().toISOString()

    for (const op of ops) {
      if (op.type === 'clear') {
        if (!auth.isStaff) continue // only staff can clear the board
        await service.from('whiteboard_elements').update({ deleted: true, updated_at: now }).eq('board_id', boardId).eq('deleted', false)
        await service.from('whiteboard_events').insert({ board_id: boardId, op: 'clear', actor: user.id })
        continue
      }
      const el = op.element
      if (!el?.id) continue

      if (op.type === 'add') {
        await service.from('whiteboard_elements').upsert({
          id: el.id, board_id: boardId, kind: el.kind || 'sticky', data: el.data || {}, z: el.z ?? 0, deleted: false, updated_by: user.id, updated_at: now,
        })
        await service.from('whiteboard_events').insert({ board_id: boardId, op: 'add', element_id: el.id, data: el.data || {}, actor: user.id })
      } else if (op.type === 'update') {
        await service.from('whiteboard_elements').update({ data: el.data || {}, z: el.z ?? 0, updated_by: user.id, updated_at: now }).eq('id', el.id).eq('board_id', boardId)
        await service.from('whiteboard_events').insert({ board_id: boardId, op: 'update', element_id: el.id, data: el.data || {}, actor: user.id })
      } else if (op.type === 'delete') {
        await service.from('whiteboard_elements').update({ deleted: true, updated_at: now }).eq('id', el.id).eq('board_id', boardId)
        await service.from('whiteboard_events').insert({ board_id: boardId, op: 'delete', element_id: el.id, actor: user.id })
      }
    }

    await service.from('whiteboards').update({ updated_at: now }).eq('id', boardId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[whiteboards/:id] POST error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
