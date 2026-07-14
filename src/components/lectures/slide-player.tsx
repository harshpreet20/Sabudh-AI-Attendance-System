'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, Presentation, Maximize2, Minimize2, PictureInPicture2, X, GripHorizontal,
} from 'lucide-react'

export interface Slide { index: number; lines: string[]; images: string[] }
export interface Deck { lectureId: string; materialId: string; title?: string }
export type PlayerView = 'inline' | 'float' | 'full'

interface PlayerCtx {
  active: Deck | null
  slides: Slide[] | null
  loading: boolean
  error: string
  index: number
  view: PlayerView
  keyOf: (d: Deck) => string
  isActive: (d: Deck) => boolean
  open: (d: Deck) => void
  setIndex: (i: number) => void
  next: () => void
  prev: () => void
  setView: (v: PlayerView) => void
  dock: () => void
  coveragePct: number | null
}

const Ctx = createContext<PlayerCtx | null>(null)

export function useSlidePlayer(): PlayerCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSlidePlayer must be used within SlidePlayerProvider')
  return c
}

const keyOf = (d: Deck) => `${d.lectureId}:${d.materialId}`

export function SlidePlayerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Deck | null>(null)
  const [cache, setCache] = useState<Record<string, Slide[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [index, setIndexState] = useState(0)
  const [view, setView] = useState<PlayerView>('inline')

  const slides = active ? cache[keyOf(active)] ?? null : null

  // Keep the updater pure: same deck keeps view/index (but adopts a new title);
  // a different deck replaces it. Side-effect resets happen in the effect below.
  const open = useCallback((d: Deck) => {
    setActive((prev) => (prev && keyOf(prev) === keyOf(d) ? { ...prev, title: d.title ?? prev.title } : d))
  }, [])

  // Reset navigation/view state only when the active deck's identity changes.
  const prevKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const k = active ? keyOf(active) : null
    if (k === prevKeyRef.current) return
    prevKeyRef.current = k
    setView('inline')
    setIndexState(0)
    setError('')
  }, [active])

  // Load slides for the active deck (cached per material).
  useEffect(() => {
    if (!active) return
    const k = keyOf(active)
    if (cache[k]) return
    let cancelled = false
    setLoading(true); setError('')
    ;(async () => {
      try {
        const res = await fetch(`/api/lectures/${active.lectureId}/material/${active.materialId}/slides`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.success) { setError(json.error?.message || 'Could not open this presentation.'); return }
        setCache((c) => ({ ...c, [k]: json.data.slides || [] }))
      } catch {
        if (!cancelled) setError('Could not open this presentation.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [active, cache])

  // --- coverage (slide-view progress) ------------------------------------
  const [coverage, setCoverage] = useState<Record<string, number>>({})
  const coveragePct = active ? coverage[keyOf(active)] ?? null : null

  // Seed coverage when the active deck changes.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch(`/api/lectures/${active.lectureId}/material/${active.materialId}/progress`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setCoverage((c) => ({ ...c, [keyOf(active)]: j.data.pct })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active])

  // Mark a slide viewed after a short dwell (debounced), and update coverage.
  useEffect(() => {
    if (!active || !slides || slides.length === 0) return
    const deck = active
    const t = setTimeout(() => {
      fetch(`/api/lectures/${deck.lectureId}/material/${deck.materialId}/progress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide: index + 1, total: slides.length }),
      }).then((r) => r.json())
        .then((j) => { if (j.success) setCoverage((c) => ({ ...c, [keyOf(deck)]: j.data.pct })) })
        .catch(() => {})
    }, 1200)
    return () => clearTimeout(t)
  }, [active, slides, index])

  const total = slides?.length || 0
  const setIndex = useCallback((i: number) => setIndexState(Math.max(0, Math.min((total || 1) - 1, i))), [total])
  const next = useCallback(() => setIndexState((c) => Math.min((total || 1) - 1, c + 1)), [total])
  const prev = useCallback(() => setIndexState((c) => Math.max(0, c - 1)), [])
  const dock = useCallback(() => setView('inline'), [])

  const value = useMemo<PlayerCtx>(() => ({
    active, slides, loading, error, index, view,
    keyOf, isActive: (d) => !!active && keyOf(active) === keyOf(d),
    open, setIndex, next, prev, setView, dock, coveragePct,
  }), [active, slides, loading, error, index, view, open, setIndex, next, prev, dock, coveragePct])

  return (
    <Ctx.Provider value={value}>
      {children}
      <GlobalSlideLayer />
    </Ctx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Presentational slide stage (shared by inline / float / fullscreen)
// ---------------------------------------------------------------------------
export function SlideStage({ compact = false }: { compact?: boolean }) {
  const p = useSlidePlayer()
  const slides = p.slides
  if (!slides || slides.length === 0) return null
  const slide = slides[Math.min(p.index, slides.length - 1)]
  const titleHeavy = slide.lines.length <= 2 && slide.images.length === 0

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className={`flex h-full flex-col gap-4 overflow-y-auto ${compact ? 'p-3' : 'p-4 sm:p-8'}`}>
        {slide.images.length > 0 && (
          <div className={`grid gap-3 ${slide.images.length > 1 && !compact ? 'sm:grid-cols-2' : ''}`}>
            {slide.images.map((src, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={src} alt="" draggable={false}
                className={`mx-auto max-w-full rounded-lg object-contain ${compact ? 'max-h-24' : 'max-h-[38vh] sm:max-h-[46vh]'}`} />
            ))}
          </div>
        )}
        {slide.lines.length > 0 && (
          <div className={titleHeavy && !compact ? 'flex flex-1 flex-col items-center justify-center text-center' : ''}>
            {slide.lines.map((line, k) => (
              k === 0 ? (
                <h2 key={k} className={`font-bold text-gray-900 ${compact ? 'text-sm mb-1' : titleHeavy ? 'text-2xl sm:text-4xl' : 'text-lg sm:text-2xl mb-2'}`}>{line}</h2>
              ) : (
                <p key={k} className={`flex gap-2 text-gray-700 ${compact ? 'text-xs mb-1' : 'text-base sm:text-lg leading-relaxed mb-2'}`}>
                  {!titleHeavy && <span className={`mt-1.5 shrink-0 rounded-full bg-indigo-400 ${compact ? 'h-1 w-1' : 'h-1.5 w-1.5 sm:mt-2.5'}`} />}
                  <span>{line}</span>
                </p>
              )
            ))}
          </div>
        )}
      </div>
      <button onClick={p.prev} disabled={p.index === 0} aria-label="Previous slide"
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow ring-1 ring-gray-200 transition disabled:opacity-30 hover:bg-white ${compact ? 'p-1' : 'p-2'}`}>
        <ChevronLeft className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
      <button onClick={p.next} disabled={p.index >= slides.length - 1} aria-label="Next slide"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow ring-1 ring-gray-200 transition disabled:opacity-30 hover:bg-white ${compact ? 'p-1' : 'p-2'}`}>
        <ChevronRight className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
    </div>
  )
}

export function ModeButtons() {
  const p = useSlidePlayer()
  return (
    <div className="flex items-center gap-1">
      {p.view !== 'full' && (
        <button onClick={() => p.setView('full')} title="Fullscreen" aria-label="Fullscreen" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><Maximize2 className="h-4 w-4" /></button>
      )}
      {p.view === 'full' && (
        <button onClick={() => p.setView('inline')} title="Exit fullscreen" aria-label="Exit fullscreen" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><Minimize2 className="h-4 w-4" /></button>
      )}
      {p.view !== 'float' ? (
        <button onClick={() => p.setView('float')} title="Floating window" aria-label="Floating window" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><PictureInPicture2 className="h-4 w-4" /></button>
      ) : (
        <button onClick={() => p.setView('inline')} title="Dock back" aria-label="Dock back" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      )}
    </div>
  )
}

function Counter({ compact = false }: { compact?: boolean }) {
  const p = useSlidePlayer()
  const total = p.slides?.length || 0
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs text-gray-500">{p.active?.title}</span>
      <div className="flex items-center gap-2">
        {!compact && <Button variant="secondary" size="sm" onClick={p.prev} disabled={p.index === 0}>Prev</Button>}
        <span className="text-xs font-medium text-gray-700 tabular-nums sm:text-sm">{p.index + 1} / {total}</span>
        {!compact && <Button variant="secondary" size="sm" onClick={p.next} disabled={p.index >= total - 1}>Next</Button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Global layer: fullscreen + smooth, draggable, corner-snapping float window
// ---------------------------------------------------------------------------
function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setM(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

function GlobalSlideLayer() {
  const p = useSlidePlayer()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Esc exits fullscreen / floating back to inline.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing && e.key !== 'Escape') return
      if (e.key === 'Escape' && p.view !== 'inline') p.setView('inline')
      else if (e.key === 'ArrowRight') p.next()
      else if (e.key === 'ArrowLeft') p.prev()
    }
    if (p.view === 'inline') return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  useEffect(() => {
    if (p.view !== 'full') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [p.view])

  if (!mounted || !p.slides || p.slides.length === 0) return null
  if (p.view === 'full') return createPortal(<FullscreenPlayer />, document.body)
  if (p.view === 'float') return createPortal(<FloatingPlayer />, document.body)
  return null
}

function FullscreenPlayer() {
  const [shown, setShown] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r) }, [])
  const p = useSlidePlayer()
  return (
    <div className="fixed inset-0 z-[120] flex select-none flex-col bg-white transition-opacity duration-200" style={{ opacity: shown ? 1 : 0 }} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-700"><Presentation className="h-4 w-4 shrink-0 text-indigo-500" /><span className="truncate">{p.active?.title || 'Slides'}</span></span>
        <ModeButtons />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-5">
        <SlideStage />
        <Counter />
        <ThumbStrip />
      </div>
    </div>
  )
}

const FLOAT_W = 384
const MARGIN = 16

function FloatingPlayer() {
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [shown, setShown] = useState(false)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const snapCorner = useCallback(() => {
    const el = ref.current
    const w = el?.offsetWidth || FLOAT_W
    const h = el?.offsetHeight || 320
    return { x: window.innerWidth - w - MARGIN, y: window.innerHeight - h - MARGIN }
  }, [])

  // Initial position (bottom-right) + entrance animation.
  useEffect(() => {
    if (isMobile) return
    setPos(snapCorner())
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [isMobile, snapCorner])

  useEffect(() => { if (isMobile) { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r) } }, [isMobile])

  // Keep it on-screen when the viewport resizes.
  useEffect(() => {
    if (isMobile) return
    const onResize = () => setPos((cur) => {
      const el = ref.current
      const w = el?.offsetWidth || FLOAT_W
      const h = el?.offsetHeight || 320
      return { x: Math.min(cur.x, window.innerWidth - w - MARGIN), y: Math.min(cur.y, window.innerHeight - h - MARGIN) }
    })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isMobile])

  const onPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const el = ref.current
    const w = el?.offsetWidth || FLOAT_W
    const h = el?.offsetHeight || 320
    const nx = Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, d.ox + (e.clientX - d.px)))
    const ny = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, d.oy + (e.clientY - d.py)))
    setPos({ x: nx, y: ny })
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    // Snap to the nearest horizontal edge (YouTube-style), keep vertical.
    const el = ref.current
    const w = el?.offsetWidth || FLOAT_W
    const h = el?.offsetHeight || 320
    setPos((cur) => {
      const centerX = cur.x + w / 2
      const left = MARGIN
      const right = window.innerWidth - w - MARGIN
      const x = centerX < window.innerWidth / 2 ? left : right
      const y = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, cur.y))
      return { x, y }
    })
  }

  if (isMobile) {
    // Bottom sheet on phones — no dragging, thumb-reachable controls.
    return (
      <div className="pointer-events-none fixed inset-0 z-[110]">
        <div className="pointer-events-auto fixed inset-x-3 bottom-3 flex max-h-[62vh] select-none flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-200"
          style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(16px)' }} onContextMenu={(e) => e.preventDefault()}>
          <FloatChrome />
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[110]">
      <div
        ref={ref}
        className="pointer-events-auto absolute left-0 top-0 flex max-h-[min(70vh,520px)] select-none flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        style={{
          width: FLOAT_W,
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(.22,1,.36,1), opacity 200ms',
          opacity: shown ? 1 : 0,
          willChange: 'transform',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <FloatChrome draggable />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <SlideStage compact />
          <Counter compact />
        </div>
      </div>
    </div>
  )
}

function FloatChrome({ draggable = false }: { draggable?: boolean }) {
  const p = useSlidePlayer()
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1.5">
      <span className="flex items-center gap-1.5 truncate text-xs font-medium text-gray-700">
        {draggable ? <GripHorizontal className="h-4 w-4 shrink-0 text-gray-300" /> : <Presentation className="h-4 w-4 shrink-0 text-indigo-500" />}
        <span className="truncate">{p.active?.title || 'Slides'}</span>
      </span>
      <ModeButtons />
    </div>
  )
}

function ThumbStrip() {
  const p = useSlidePlayer()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector(`[data-thumb="${p.index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [p.index])
  if (!p.slides) return null
  return (
    <div ref={ref} className="flex gap-2 overflow-x-auto pb-1">
      {p.slides.map((s, k) => (
        <button key={k} data-thumb={k} onClick={() => p.setIndex(k)}
          className={`shrink-0 rounded-lg border p-2 text-left transition ${k === p.index ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
          style={{ width: 112 }}>
          <div className="mb-1 text-[10px] font-medium text-gray-400">Slide {k + 1}</div>
          <div className="line-clamp-2 text-[11px] leading-snug text-gray-600">{s.lines[0] || (s.images.length ? '🖼️ image' : '—')}</div>
        </button>
      ))}
    </div>
  )
}

export { ThumbStrip }
