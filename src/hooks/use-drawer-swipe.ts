import { useEffect } from 'react'

interface DrawerSwipeOptions {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  /** How close to the left edge a swipe must start to open the drawer (px). */
  edgeSize?: number
  /** Minimum horizontal distance to count as a swipe (px). */
  threshold?: number
  /** Disable above this viewport width (px) — the drawer is permanent on desktop. */
  maxWidth?: number
}

/**
 * Native-style swipe gestures for the mobile navigation drawer:
 * - swipe right from the left edge to open
 * - swipe left anywhere to close
 *
 * Listeners are passive (they never block scrolling); a swipe only counts when
 * it's more horizontal than vertical, so vertical scrolling is unaffected.
 */
export function useDrawerSwipe({
  isOpen,
  onOpen,
  onClose,
  edgeSize = 30,
  threshold = 60,
  maxWidth = 1024,
}: DrawerSwipeOptions) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('ontouchstart' in window)) return

    let startX = 0
    let startY = 0
    let fromEdge = false
    let tracking = false

    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= maxWidth) return
      // Ignore multi-touch (pinch/zoom) gestures.
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      fromEdge = startX <= edgeSize
      tracking = true
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Predominantly vertical → treat as a scroll, not a swipe.
      if (Math.abs(dx) <= Math.abs(dy)) return

      if (!isOpen && fromEdge && dx >= threshold) {
        onOpen()
      } else if (isOpen && dx <= -threshold) {
        onClose()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [isOpen, onOpen, onClose, edgeSize, threshold, maxWidth])
}
