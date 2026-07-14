'use client'

import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle, Presentation, PictureInPicture2 } from 'lucide-react'
import { useSlidePlayer, SlideStage, ModeButtons, ThumbStrip } from './slide-player'

interface Props {
  lectureId: string
  materialId: string
  title?: string
}

// Thin inline entry point for a PowerPoint. The actual player state lives in the
// workspace-level SlidePlayerProvider, so fullscreen / floating windows persist
// across tab switches. This renders the inline deck (or a "docked" placeholder
// while the deck is popped out).
export function PptxDeck({ lectureId, materialId, title }: Props) {
  const p = useSlidePlayer()

  useEffect(() => {
    p.open({ lectureId, materialId, title })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, materialId])

  const isActive = p.isActive({ lectureId, materialId })
  if (!isActive) return null

  if (p.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{p.error}</p>
      </div>
    )
  }
  if (p.loading || !p.slides) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Presentation className="h-4 w-4 animate-pulse" /> Building interactive slides…</div>
        <Skeleton className="h-[42vh] sm:h-[55vh] w-full" />
      </div>
    )
  }
  if (p.slides.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-500">No slides could be read from this presentation.</div>
  }

  // Popped out — show a placeholder so the tab layout stays put.
  if (p.view !== 'inline') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-10 text-center text-gray-500">
        <PictureInPicture2 className="h-7 w-7" />
        <p className="text-sm">{p.view === 'full' ? 'Open in fullscreen.' : 'Playing in a floating window.'}</p>
        <Button variant="secondary" size="sm" onClick={p.dock}>Dock back here</Button>
      </div>
    )
  }

  return (
    <div className="flex select-none flex-col gap-3" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Presentation className="h-4 w-4 text-indigo-500" /> Interactive slides</span>
        <ModeButtons />
      </div>
      {p.coveragePct !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Topic coverage</span>
            <span className="font-medium text-gray-700 tabular-nums">{p.coveragePct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200">
            <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${p.coveragePct}%` }} />
          </div>
        </div>
      )}
      <div className="flex h-[44vh] flex-col sm:h-[56vh]"><SlideStage /></div>
      <Counter />
      <ThumbStrip />
      <p className="text-center text-[11px] text-gray-400">← → to move · Fullscreen or pop out to a floating window · streamed securely.</p>
    </div>
  )
}

// Inline counter (kept here to avoid exporting internals broadly).
function Counter() {
  const p = useSlidePlayer()
  const total = p.slides?.length || 0
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs text-gray-500">{p.active?.title}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={p.prev} disabled={p.index === 0}>Prev</Button>
        <span className="text-xs font-medium text-gray-700 tabular-nums sm:text-sm">{p.index + 1} / {total}</span>
        <Button variant="secondary" size="sm" onClick={p.next} disabled={p.index >= total - 1}>Next</Button>
      </div>
    </div>
  )
}
