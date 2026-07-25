'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Loader2 } from 'lucide-react'

interface SelfieCaptureProps {
  onCaptured: (dataUrl: string) => void
  onClose: () => void
}

/**
 * Full-screen front-camera selfie capture. Draws the current frame to a canvas
 * and returns a JPEG data URL. Works across browsers/PWAs (iOS Safari included).
 */
export function SelfieCapture({ onCaptured, onClose }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
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
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) setError('Could not open the camera. Please allow camera access.')
      }
    }

    start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    onCaptured(canvas.toDataURL('image/jpeg', 0.85))
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-black">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <p className="text-sm font-semibold">Take a selfie in class</p>
        <button
          onClick={onClose}
          className="rounded-xl bg-white/10 p-2 hover:bg-white/20"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover [transform:scaleX(-1)]"
          muted
          playsInline
        />
        {error && (
          <div className="absolute inset-x-6 bottom-28 rounded-xl bg-red-500/90 px-4 py-3 text-center text-sm font-medium text-white">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center px-5 py-6">
        {ready && !error ? (
          <button
            onClick={capture}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-white/40 active:scale-95"
            aria-label="Capture selfie"
          >
            <Camera className="h-7 w-7 text-gray-900" />
          </button>
        ) : (
          !error && <Loader2 className="h-7 w-7 animate-spin text-white/80" />
        )}
      </div>
      <p className="pb-6 text-center text-xs text-white/70">
        Make sure your face and the classroom behind you are visible.
      </p>
    </div>,
    document.body
  )
}
