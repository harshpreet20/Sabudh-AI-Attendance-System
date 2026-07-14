'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MousePointer2, StickyNote, Square, Type, Pen, Trash2, Hand, Sparkles, Play, Eye, EyeOff, X, Users,
} from 'lucide-react'

type Kind = 'sticky' | 'rect' | 'ellipse' | 'text' | 'path' | 'connector'
interface El { id: string; kind: Kind; data: Record<string, unknown>; z: number }
type Tool = 'select' | 'pan' | 'sticky' | 'rect' | 'ellipse' | 'text' | 'pen' | 'eraser'

interface Presence { name: string; color: string; cursor?: { x: number; y: number } }

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#ec4899']
const myColor = COLORS[Math.floor(Math.random() * COLORS.length)]

function num(v: unknown, d = 0): number {
  return typeof v === 'number' ? v : d
}
function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}

// Collaborative, realtime lecture whiteboard (Miro-style MVP): sticky notes,
// shapes, text and freehand; pan/zoom; live cursors + presence; silent
// observation for staff; AI mind-map generation; and full replay of the board.
export function Whiteboard({ lectureId, canObserve }: { lectureId: string; canObserve: boolean }) {
  const supabase = useRef(createClient()).current
  const [clientId] = useState(() => Math.random().toString(36).slice(2))
  const [loading, setLoading] = useState(true)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [elements, setElements] = useState<Record<string, El>>({})
  const [tool, setTool] = useState<Tool>('select')
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const [others, setOthers] = useState<Presence[]>([])
  const [silent, setSilent] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const drag = useRef<{ id?: string; kind?: 'move' | 'pan' | 'pen'; startX: number; startY: number; ox: number; oy: number; points?: number[][] } | null>(null)
  const nameRef = useRef('User')

  const applyRemote = useCallback((payload: { type: string; element?: El }) => {
    setElements((prev) => {
      const next = { ...prev }
      if (payload.type === 'clear') return {}
      const el = payload.element
      if (!el) return prev
      if (payload.type === 'delete') delete next[el.id]
      else next[el.id] = el
      return next
    })
  }, [])

  // --- load + realtime -----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      nameRef.current = (user?.user_metadata?.full_name as string) || user?.email?.split('@')[0] || 'User'
      const res = await fetch(`/api/lectures/${lectureId}/whiteboard`).then((r) => r.json())
      if (cancelled) return
      if (!res.success) { setLoading(false); toast.error('Could not open whiteboard'); return }
      setBoardId(res.data.board_id)
      const map: Record<string, El> = {}
      for (const e of res.data.elements as El[]) map[e.id] = e
      setElements(map)
      setLoading(false)

      const channel = supabase.channel(`wb:${res.data.board_id}`, {
        config: { presence: { key: clientId }, broadcast: { self: false } },
      })
      channel
        .on('broadcast', { event: 'op' }, ({ payload }) => applyRemote(payload as { type: string; element?: El }))
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState() as Record<string, Presence[]>
          const list: Presence[] = []
          for (const key of Object.keys(state)) {
            if (key === clientId) continue
            const p = state[key]?.[0]
            if (p) list.push(p)
          }
          setOthers(list)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !silent) await channel.track({ name: nameRef.current, color: myColor })
        })
      channelRef.current = channel
    })()
    return () => {
      cancelled = true
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId])

  const broadcast = useCallback((type: string, element?: El) => {
    channelRef.current?.send({ type: 'broadcast', event: 'op', payload: { type, element } })
  }, [])

  const persist = useCallback(async (ops: Array<{ type: string; element?: El }>) => {
    if (!boardId) return
    await fetch(`/api/whiteboards/${boardId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }),
    }).catch(() => {})
  }, [boardId])

  // --- coordinate helpers --------------------------------------------------
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale }
  }, [view])

  function commitAdd(el: El) {
    setElements((prev) => ({ ...prev, [el.id]: el }))
    broadcast('add', el)
    persist([{ type: 'add', element: el }])
  }
  function commitUpdate(el: El, live = false) {
    setElements((prev) => ({ ...prev, [el.id]: el }))
    broadcast('update', el)
    if (!live) persist([{ type: 'update', element: el }])
  }
  function commitDelete(id: string) {
    setElements((prev) => { const n = { ...prev }; delete n[id]; return n })
    broadcast('delete', elements[id])
    persist([{ type: 'delete', element: { id } as El }])
    if (selected === id) setSelected(null)
  }

  // --- pointer interactions ------------------------------------------------
  function onSurfacePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const w = toWorld(e.clientX, e.clientY)
    if (tool === 'pan') {
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y }
      return
    }
    if (tool === 'pen') {
      drag.current = { kind: 'pen', startX: w.x, startY: w.y, ox: 0, oy: 0, points: [[w.x, w.y]] }
      return
    }
    if (tool === 'sticky' || tool === 'rect' || tool === 'ellipse' || tool === 'text') {
      const id = crypto.randomUUID()
      const base: Record<string, unknown> = tool === 'text'
        ? { x: w.x, y: w.y, w: 160, h: 32, text: 'Text', color: '#111827' }
        : { x: w.x - 70, y: w.y - 35, w: 140, h: 70, text: tool === 'sticky' ? 'Note' : '', color: tool === 'sticky' ? '#fde68a' : '#ffffff' }
      const z = Object.keys(elements).length + 1
      const el: El = { id, kind: tool as Kind, data: base, z }
      commitAdd(el)
      setSelected(id)
      setTool('select')
      return
    }
    // select tool on empty surface -> pan
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y }
    setSelected(null)
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    // presence cursor (throttled by rAF-ish via native events is fine here)
    if (!silent && channelRef.current) {
      const w = toWorld(e.clientX, e.clientY)
      channelRef.current.track({ name: nameRef.current, color: myColor, cursor: { x: w.x, y: w.y } })
    }
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }))
    } else if (d.kind === 'pen') {
      const w = toWorld(e.clientX, e.clientY)
      d.points!.push([w.x, w.y])
      // live preview by updating a temp path element id
      const id = 'pen-temp'
      setElements((prev) => ({ ...prev, [id]: { id, kind: 'path', data: { points: d.points, color: '#111827' }, z: 9999 } }))
    } else if (d.kind === 'move' && d.id) {
      const w = toWorld(e.clientX, e.clientY)
      const el = elements[d.id]
      if (el) {
        const moved: El = { ...el, data: { ...el.data, x: d.ox + (w.x - d.startX), y: d.oy + (w.y - d.startY) } }
        commitUpdate(moved, true)
      }
    }
  }

  function onSurfacePointerUp() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'pen' && d.points && d.points.length > 1) {
      const id = crypto.randomUUID()
      const el: El = { id, kind: 'path', data: { points: d.points, color: '#111827' }, z: Object.keys(elements).length + 1 }
      setElements((prev) => { const n = { ...prev }; delete n['pen-temp']; n[id] = el; return n })
      broadcast('add', el)
      persist([{ type: 'add', element: el }])
    } else if (d.kind === 'move' && d.id) {
      const el = elements[d.id]
      if (el) persist([{ type: 'update', element: el }])
    }
  }

  function onElementPointerDown(e: React.PointerEvent, id: string) {
    if (tool === 'eraser') { e.stopPropagation(); commitDelete(id); return }
    if (tool !== 'select') return
    e.stopPropagation()
    setSelected(id)
    const w = toWorld(e.clientX, e.clientY)
    const el = elements[id]
    drag.current = { kind: 'move', id, startX: w.x, startY: w.y, ox: num(el.data.x), oy: num(el.data.y) }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = surfaceRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const delta = -e.deltaY * 0.0015
    setView((v) => {
      const scale = Math.min(3, Math.max(0.3, v.scale * (1 + delta)))
      const k = scale / v.scale
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
    })
  }

  function editText(id: string) {
    const el = elements[id]
    if (!el || (el.kind !== 'sticky' && el.kind !== 'text' && el.kind !== 'rect')) return
    const text = window.prompt('Edit text', str(el.data.text))
    if (text === null) return
    commitUpdate({ ...el, data: { ...el.data, text } })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && document.activeElement === document.body) {
        commitDelete(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, elements])

  async function generateAi() {
    setAiBusy(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/whiteboard`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) { toast.error(json.error?.message || 'AI generation failed'); return }
      setElements((prev) => {
        const n = { ...prev }
        for (const el of json.data.elements as El[]) n[el.id] = el
        return n
      })
      toast.success('AI mind map added')
    } finally {
      setAiBusy(false)
    }
  }

  function toggleSilent() {
    const next = !silent
    setSilent(next)
    if (next) channelRef.current?.untrack()
    else channelRef.current?.track({ name: nameRef.current, color: myColor })
  }

  async function clearBoard() {
    if (!confirm('Clear the whole board for everyone?')) return
    setElements({})
    broadcast('clear')
    persist([{ type: 'clear' }])
  }

  if (loading) return <Skeleton className="h-[60vh] w-full" />

  const els = Object.values(elements).sort((a, b) => a.z - b.z)
  const connectors = els.filter((e) => e.kind === 'sticky' && e.data.from)

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 flex-wrap rounded-xl border border-gray-200 bg-white p-1.5">
        {([
          ['select', MousePointer2, 'Select/Move'],
          ['pan', Hand, 'Pan'],
          ['sticky', StickyNote, 'Sticky note'],
          ['rect', Square, 'Rectangle'],
          ['text', Type, 'Text'],
          ['pen', Pen, 'Pen'],
          ['eraser', Trash2, 'Erase'],
        ] as Array<[Tool, typeof Square, string]>).map(([t, Icon, label]) => (
          <button key={t} title={label} onClick={() => setTool(t)} className={`rounded-lg p-2 ${tool === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <Button size="sm" variant="secondary" onClick={generateAi} loading={aiBusy} disabled={aiBusy}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> AI diagram
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setReplayOpen(true)}>
          <Play className="h-3.5 w-3.5 mr-1" /> Replay
        </Button>
        {canObserve && (
          <Button size="sm" variant={silent ? 'default' : 'secondary'} onClick={toggleSilent} title="Observe without appearing to students">
            {silent ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
            {silent ? 'Silent on' : 'Silent'}
          </Button>
        )}
        {canObserve && <Button size="sm" variant="secondary" onClick={clearBoard}><Trash2 className="h-3.5 w-3.5 mr-1" /> Clear</Button>}
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5" />
          {others.length + (silent ? 0 : 1)}
          {others.slice(0, 5).map((p, i) => (
            <span key={i} className="ml-0.5 inline-block h-3 w-3 rounded-full ring-1 ring-white" style={{ background: p.color }} title={p.name} />
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={surfaceRef}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onWheel={onWheel}
        className="relative h-[62vh] w-full overflow-hidden rounded-xl border border-gray-200 bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {/* connectors + paths */}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            {connectors.map((c) => {
              const parent = elements[str(c.data.from)]
              if (!parent) return null
              return <line key={`c-${c.id}`} x1={num(parent.data.x) + num(parent.data.w) / 2} y1={num(parent.data.y) + num(parent.data.h) / 2} x2={num(c.data.x) + num(c.data.w) / 2} y2={num(c.data.y) + num(c.data.h) / 2} stroke="#c7d2fe" strokeWidth={2} />
            })}
            {els.filter((e) => e.kind === 'path').map((e) => {
              const pts = (e.data.points as number[][]) || []
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
              return <path key={e.id} d={d} fill="none" stroke={str(e.data.color, '#111827')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            })}
          </svg>

          {/* box elements */}
          {els.filter((e) => e.kind !== 'path').map((e) => {
            const isSel = selected === e.id
            const common: React.CSSProperties = { position: 'absolute', left: num(e.data.x), top: num(e.data.y), width: num(e.data.w, 140), height: num(e.data.h, 70) }
            if (e.kind === 'text') {
              return (
                <div key={e.id} style={{ ...common, height: 'auto' }} onPointerDown={(ev) => onElementPointerDown(ev, e.id)} onDoubleClick={() => editText(e.id)}
                  className={`select-none px-1 text-sm font-medium ${isSel ? 'outline outline-2 outline-indigo-400' : ''}`}>
                  <span style={{ color: str(e.data.color, '#111827') }}>{str(e.data.text, 'Text')}</span>
                </div>
              )
            }
            const rounded = e.kind === 'ellipse' ? 'rounded-full' : e.kind === 'sticky' ? 'rounded-md' : 'rounded-lg'
            return (
              <div key={e.id} style={{ ...common, background: e.kind === 'rect' ? 'transparent' : str(e.data.color, '#fde68a'), borderColor: e.kind === 'rect' ? str(e.data.color, '#111827') : 'transparent' }}
                onPointerDown={(ev) => onElementPointerDown(ev, e.id)} onDoubleClick={() => editText(e.id)}
                className={`flex items-center justify-center overflow-hidden p-1.5 text-center text-xs shadow-sm select-none ${rounded} ${e.kind === 'rect' ? 'border-2' : ''} ${isSel ? 'outline outline-2 outline-indigo-400' : ''}`}>
                <span style={{ color: e.kind === 'sticky' ? '#78350f' : '#111827' }}>{str(e.data.text)}</span>
              </div>
            )
          })}

          {/* other cursors */}
          {!silent && others.filter((p) => p.cursor).map((p, i) => (
            <div key={i} className="pointer-events-none absolute" style={{ left: p.cursor!.x, top: p.cursor!.y }}>
              <MousePointer2 className="h-4 w-4" style={{ color: p.color }} />
              <span className="ml-2 rounded px-1 text-[10px] text-white" style={{ background: p.color }}>{p.name}</span>
            </div>
          ))}
        </div>

        {silent && (
          <div className="absolute right-3 top-3 rounded-full bg-gray-900/80 px-2 py-1 text-[11px] text-white">Silent observation</div>
        )}
      </div>
      <p className="text-center text-[11px] text-gray-400">Double-click a note to edit · scroll to zoom · Pan tool to move around · changes sync live.</p>

      {replayOpen && boardId && <ReplayOverlay boardId={boardId} onClose={() => setReplayOpen(false)} />}
    </div>
  )
}

// --- Replay overlay --------------------------------------------------------
interface Ev { id: number; op: string; element_id: string | null; data: Record<string, unknown> }
function ReplayOverlay({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [events, setEvents] = useState<Ev[]>([])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/whiteboards/${boardId}`).then((r) => r.json()).then((j) => {
      if (j.success) { setEvents(j.data.events); setIdx(j.data.events.length) }
    }).finally(() => setLoading(false))
  }, [boardId])

  useEffect(() => {
    if (!playing) return
    if (idx >= events.length) { setPlaying(false); return }
    const t = setTimeout(() => setIdx((i) => i + 1), 400)
    return () => clearTimeout(t)
  }, [playing, idx, events.length])

  // Reconstruct board state up to idx.
  const state: Record<string, El> = {}
  for (let i = 0; i < idx; i++) {
    const e = events[i]
    if (!e) break
    if (e.op === 'clear') { for (const k of Object.keys(state)) delete state[k]; continue }
    if (!e.element_id) continue
    if (e.op === 'delete') delete state[e.element_id]
    else state[e.element_id] = { id: e.element_id, kind: (e.data.kind as Kind) || 'sticky', data: e.data, z: 0 }
  }
  const els = Object.values(state)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Whiteboard replay</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        {loading ? <Skeleton className="h-80 w-full" /> : (
          <>
            <div className="relative h-[55vh] overflow-hidden rounded-xl border border-gray-200 bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
                {els.filter((e) => e.kind === 'path').map((e) => {
                  const pts = (e.data.points as number[][]) || []
                  return <path key={e.id} d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')} fill="none" stroke={str(e.data.color, '#111827')} strokeWidth={2} />
                })}
              </svg>
              {els.filter((e) => e.kind !== 'path').map((e) => (
                <div key={e.id} style={{ position: 'absolute', left: num(e.data.x), top: num(e.data.y), width: num(e.data.w, 140), height: num(e.data.h, 70), background: str(e.data.color, '#fde68a') }}
                  className="flex items-center justify-center overflow-hidden rounded-md p-1.5 text-center text-xs shadow-sm">
                  <span style={{ color: '#78350f' }}>{str(e.data.text)}</span>
                </div>
              ))}
              {events.length === 0 && <div className="flex h-full items-center justify-center text-sm text-gray-400">No board activity recorded yet.</div>}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={() => { if (idx >= events.length) setIdx(0); setPlaying((p) => !p) }} disabled={events.length === 0}>
                {playing ? 'Pause' : 'Play'}
              </Button>
              <input type="range" min={0} max={events.length} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }} className="flex-1" />
              <span className="text-xs text-gray-500 tabular-nums">{idx}/{events.length}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
