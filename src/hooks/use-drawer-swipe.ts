import { useEffect } from 'react'
import { isTouchDevice, supportsPointerEvents } from '@/lib/pwa'

interface DrawerSwipeOptions {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  /** How close to the left edge a swipe must start to open the drawer (px). */
  edgeSize?: number
  /** Minimum horizontal distance to count as a swipe (px). */
  threshold?: number
  /** Disable at/above this viewport width (px) — the drawer is permanent on desktop. */
  maxWidth?: number
}

/**
 * Native-style swipe gestures for the mobile navigation drawer:
 * - swipe right from the left edge to open
 * - swipe left anywhere to close
 *
 * Cross-browser by design: it prefers the Pointer Events API (Chrome, Edge,
 * Firefox, Safari 13+, Samsung Internet, …) and falls back to Touch Events on
 * older engines. Listeners are passive (they never block scrolling); a swipe
 * only counts when it's more horizontal than vertical, so vertical scrolling
 * is unaffected. Gestures are gated to touch devices below the desktop
 * breakpoint via in-house detection, so they work across every screen size
 * without interfering with mouse input.
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
    if (typeof window === 'undefined' || !isTouchDevice()) return

    let startX = 0
    let startY = 0
    let fromEdge = false
    let tracking = false

    const begin = (x: number, y: number) => {
      if (window.innerWidth >= maxWidth) {
        tracking = false
        return
      }
      startX = x
      startY = y
      fromEdge = x <= edgeSize
      tracking = true
    }

    const finish = (x: number, y: number) => {
      if (!tracking) return
      tracking = false
      const dx = x - startX
      const dy = y - startY
      // Predominantly vertical → treat as a scroll, not a swipe.
      if (Math.abs(dx) <= Math.abs(dy)) return

      if (!isOpen && fromEdge && dx >= threshold) {
        onOpen()
      } else if (isOpen && dx <= -threshold) {
        onClose()
      }
    }

    const usePointer = supportsPointerEvents()

    // Pointer Events path (all modern browsers). Ignore mouse so a click-drag
    // with the cursor never opens the menu; touch and pen behave as swipes.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      begin(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      finish(e.clientX, e.clientY)
    }
    const onPointerCancel = () => {
      tracking = false
    }

    // Touch Events fallback for engines without PointerEvent.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      begin(t.clientX, t.clientY)
    }
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (t) finish(t.clientX, t.clientY)
    }

    if (usePointer) {
      document.addEventListener('pointerdown', onPointerDown, { passive: true })
      document.addEventListener('pointerup', onPointerUp, { passive: true })
      document.addEventListener('pointercancel', onPointerCancel, { passive: true })
      return () => {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('pointerup', onPointerUp)
        document.removeEventListener('pointercancel', onPointerCancel)
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
