'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, AlertCircle, Presentation } from 'lucide-react'

interface Slide { index: number; lines: string[]; images: string[] }
interface Props {
  lectureId: string
  materialId: string
  title?: string
}

// Immersive, interactive PowerPoint reader. Slides (text + images) are parsed
// server-side; this renders them as a navigable deck with large, readable
// typography, keyboard arrows, and a thumbnail strip. No download of the file.
export function PptxDeck({ lectureId, materialId, title }: Props) {
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)

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

  const go = useCallback((next: number) => {
    setI((cur) => {
      const total = slides?.length || 0
      return Math.max(0, Math.min(total - 1, next < 0 ? cur : next))
    })
  }, [slides])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setI((c) => Math.min((slides?.length || 1) - 1, c + 1))
      else if (e.key === 'ArrowLeft') setI((c) => Math.max(0, c - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides])

  // Keep the active thumbnail in view.
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-thumb="${i}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [i])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }
  if (!slides) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Presentation className="h-4 w-4 animate-pulse" /> Building interactive slides…</div>
        <Skeleton className="h-[55vh] w-full" />
      </div>
    )
  }
  if (slides.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-500">No slides could be read from this presentation.</div>
  }

  const slide = slides[i]
  const isTitleHeavy = slide.lines.length <= 2 && slide.images.length === 0

  return (
    <div className="space-y-3 select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Stage */}
      <div className="relative rounded-xl border border-gray-200 bg-white">
        <div className="flex min-h-[55vh] flex-col gap-5 overflow-y-auto p-6 sm:p-10">
          {slide.images.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {slide.images.map((src, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={src} alt="" draggable={false} className="mx-auto max-h-[45vh] max-w-full rounded-lg object-contain" />
              ))}
            </div>
          )}
          {slide.lines.length > 0 && (
            <div className={isTitleHeavy ? 'flex flex-1 flex-col items-center justify-center text-center' : ''}>
              {slide.lines.map((line, k) => (
                k === 0 ? (
                  <h2 key={k} className={`font-bold text-gray-900 ${isTitleHeavy ? 'text-3xl sm:text-4xl' : 'text-2xl mb-3'}`}>{line}</h2>
                ) : (
                  <p key={k} className="mb-2 flex gap-2 text-lg leading-relaxed text-gray-700">
                    {!isTitleHeavy && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />}
                    <span>{line}</span>
                  </p>
                )
              ))}
            </div>
          )}
        </div>

        {/* Arrows */}
        <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow ring-1 ring-gray-200 disabled:opacity-30 hover:bg-white">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => go(i + 1)} disabled={i >= slides.length - 1} aria-label="Next slide"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow ring-1 ring-gray-200 disabled:opacity-30 hover:bg-white">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Controls + counter */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">{title}</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => go(i - 1)} disabled={i === 0}>Prev</Button>
          <span className="text-sm font-medium text-gray-700 tabular-nums">{i + 1} / {slides.length}</span>
          <Button variant="secondary" size="sm" onClick={() => go(i + 1)} disabled={i >= slides.length - 1}>Next</Button>
        </div>
      </div>

      {/* Thumbnail strip */}
      <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((s, k) => (
          <button key={k} data-thumb={k} onClick={() => setI(k)}
            className={`shrink-0 rounded-lg border p-2 text-left transition ${k === i ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
            style={{ width: 128 }}>
            <div className="mb-1 text-[10px] font-medium text-gray-400">Slide {k + 1}</div>
            <div className="line-clamp-3 text-[11px] leading-snug text-gray-600">{s.lines[0] || (s.images.length ? '🖼️ image' : '—')}</div>
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-gray-400">Use ← → arrows or the thumbnails to move · content is streamed securely.</p>
    </div>
  )
}
