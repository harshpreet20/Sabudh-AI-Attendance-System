'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, AlertCircle, Presentation,
  Maximize2, Minimize2, PictureInPicture2, X,
} from 'lucide-react'

interface Slide { index: number; lines: string[]; images: string[] }
interface Props {
  lectureId: string
  materialId: string
  title?: string
}

type View = 'inline' | 'full' | 'float'

// Immersive, interactive PowerPoint reader. Slides (text + images) are parsed
// server-side; this renders them as a navigable deck. Responsive + mobile first,
// with a fullscreen mode and a YouTube-style compact floating window.
export function PptxDeck({ lectureId, materialId, title }: Props) {
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const [view, setView] = useState<View>('inline')
  const [mounted, setMounted] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let cancelled = false
    setSlides(null); setError(''); setI(0)
    ;(async () => {
      try {
        const res = await fetch(`/api/lectures/${lectureId}/material/${materialId}/slides`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.success) { setError(json.error?.message || 'Could not open this presentation.'); return }
        setSlides(json.data.slides || [])
      } catch {
        if (!cancelled) setError('Could not open this presentation.')
      }
    })()
    return () => { cancelled = true }
  }, [lectureId, materialId])

  const total = slides?.length || 0
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(total - 1, n))), [total])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setI((c) => Math.min((slides?.length || 1) - 1, c + 1))
      else if (e.key === 'ArrowLeft') setI((c) => Math.max(0, c - 1))
      else if (e.key === 'Escape') setView('inline')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides])

  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-thumb="${i}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [i, view])

  // Lock body scroll while fullscreen.
  useEffect(() => {
    if (view !== 'full') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [view])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }
  if (!slides) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Presentation className="h-4 w-4 animate-pulse" /> Building interactive slides…</div>
        <Skeleton className="h-[42vh] sm:h-[55vh] w-full" />
      </div>
    )
  }
  if (slides.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-500">No slides could be read from this presentation.</div>
  }

  const slide = slides[i]
  const titleHeavy = slide.lines.length <= 2 && slide.images.length === 0
  const compact = view === 'float'

  // Toolbar buttons vary by mode.
  const modeButtons = (
    <div className="flex items-center gap-1">
      {view !== 'full' && (
        <button onClick={() => setView('full')} title="Fullscreen" aria-label="Fullscreen"
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><Maximize2 className="h-4 w-4" /></button>
      )}
      {view === 'full' && (
        <button onClick={() => setView('inline')} title="Exit fullscreen" aria-label="Exit fullscreen"
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><Minimize2 className="h-4 w-4" /></button>
      )}
      {view !== 'float' ? (
        <button onClick={() => setView('float')} title="Floating window" aria-label="Floating window"
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><PictureInPicture2 className="h-4 w-4" /></button>
      ) : (
        <button onClick={() => setView('inline')} title="Dock back" aria-label="Close floating window"
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      )}
    </div>
  )

  // The slide stage — sizing adapts to the mode.
  const stage = (
    <div className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white ${compact ? '' : ''}`}>
      <div className={`flex h-full flex-col gap-4 overflow-y-auto ${compact ? 'p-3' : 'p-4 sm:p-8'}`}>
        {slide.images.length > 0 && (
          <div className={`grid gap-3 ${slide.images.length > 1 && !compact ? 'sm:grid-cols-2' : ''}`}>
            {slide.images.map((src, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={src} alt="" draggable={false}
                className={`mx-auto max-w-full rounded-lg object-contain ${compact ? 'max-h-28' : 'max-h-[38vh] sm:max-h-[46vh]'}`} />
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
      <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow ring-1 ring-gray-200 disabled:opacity-30 hover:bg-white ${compact ? 'p-1' : 'p-2'}`}>
        <ChevronLeft className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
      <button onClick={() => go(i + 1)} disabled={i >= total - 1} aria-label="Next slide"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow ring-1 ring-gray-200 disabled:opacity-30 hover:bg-white ${compact ? 'p-1' : 'p-2'}`}>
        <ChevronRight className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
    </div>
  )

  const counter = (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs text-gray-500">{title}</span>
      <div className="flex items-center gap-2">
        {!compact && <Button variant="secondary" size="sm" onClick={() => go(i - 1)} disabled={i === 0}>Prev</Button>}
        <span className="text-xs font-medium text-gray-700 tabular-nums sm:text-sm">{i + 1} / {total}</span>
        {!compact && <Button variant="secondary" size="sm" onClick={() => go(i + 1)} disabled={i >= total - 1}>Next</Button>}
      </div>
    </div>
  )

  const strip = (
    <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
      {slides.map((s, k) => (
        <button key={k} data-thumb={k} onClick={() => setI(k)}
          className={`shrink-0 rounded-lg border p-2 text-left transition ${k === i ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
          style={{ width: 112 }}>
          <div className="mb-1 text-[10px] font-medium text-gray-400">Slide {k + 1}</div>
          <div className="line-clamp-2 text-[11px] leading-snug text-gray-600">{s.lines[0] || (s.images.length ? '🖼️ image' : '—')}</div>
        </button>
      ))}
    </div>
  )

  // --- INLINE -------------------------------------------------------------
  if (view === 'inline') {
    return (
      <div className="flex select-none flex-col gap-3" onContextMenu={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Presentation className="h-4 w-4 text-indigo-500" /> Interactive slides</span>
          {modeButtons}
        </div>
        <div className="flex h-[44vh] flex-col sm:h-[56vh]">{stage}</div>
        {counter}
        {strip}
        <p className="text-center text-[11px] text-gray-400">← → to move · Fullscreen or pop out to a floating window · streamed securely.</p>
      </div>
    )
  }

  const chrome = (mode: View) => (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-700">
          <Presentation className="h-4 w-4 shrink-0 text-indigo-500" /> <span className="truncate">{title || 'Slides'}</span>
        </span>
        {modeButtons}
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${mode === 'full' ? 'gap-3 p-3 sm:p-5' : 'gap-2 p-2'}`}>
        {stage}
        {counter}
        {mode === 'full' && strip}
      </div>
    </>
  )

  // --- FULLSCREEN ---------------------------------------------------------
  if (view === 'full') {
    return mounted ? createPortal(
      <div className="fixed inset-0 z-[120] flex select-none flex-col bg-white" onContextMenu={(e) => e.preventDefault()}>
        {chrome('full')}
      </div>,
      document.body,
    ) : null
  }

  // --- FLOATING (YouTube-style mini window) -------------------------------
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-10 text-center text-gray-500">
        <PictureInPicture2 className="h-7 w-7" />
        <p className="text-sm">Playing in a floating window.</p>
        <Button variant="secondary" size="sm" onClick={() => setView('inline')}>Dock back here</Button>
      </div>
      {mounted && createPortal(
        <div className="fixed bottom-4 left-4 right-4 z-[110] flex max-h-[70vh] select-none flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:left-auto sm:right-4 sm:w-96"
          onContextMenu={(e) => e.preventDefault()}>
          {chrome('float')}
        </div>,
        document.body,
      )}
    </>
  )
}
