'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import jsQR from 'jsqr'
import { X, Loader2 } from 'lucide-react'

interface QrScannerProps {
  onDetected: (text: string) => void
  onClose: () => void
}

/**
 * Full-screen QR scanner using getUserMedia + jsQR frame decoding. Works across
 * browsers/PWAs (including iOS Safari, where the BarcodeDetector API is absent).
 */
export function QrScanner({ onDetected, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectedRef = useRef(onDetected)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onDetectedRef.current = onDetected
  })

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    let done = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function tick() {
      const video = videoRef.current
      if (cancelled || done || !video || !ctx) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) {
          done = true
          onDetectedRef.current(code.data)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()
        raf = requestAnimationFrame(tick)
      } catch {
        if (!cancelled) setError('Could not open the camera. Please allow camera access.')
      }
    }

    start()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-black">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <p className="text-sm font-semibold">Scan the attendance QR</p>
        <button
          onClick={onClose}
          className="rounded-xl bg-white/10 p-2 hover:bg-white/20"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {/* Framing guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-60 w-60 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-6 bottom-10 rounded-xl bg-red-500/90 px-4 py-3 text-center text-sm font-medium text-white">
            {error}
          </div>
        )}
        {!error && (
          <div className="absolute inset-x-0 bottom-10 flex items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" />
            Point your camera at the QR on the teacher&apos;s screen
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
