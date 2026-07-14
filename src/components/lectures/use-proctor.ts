'use client'

import { useCallback, useRef, useState } from 'react'

export type FlagSeverity = 'low' | 'medium' | 'high'
export interface ProctorFlag { type: string; severity: FlagSeverity; details?: Record<string, unknown> }

interface StartOpts { camera: boolean; mic: boolean }

// Browser-feasible proctoring for a timed assessment. Monitors focus/visibility,
// fullscreen, copy/paste, and (with consent) the camera and microphone. It does
// NOT — and cannot from a web app — inspect operating-system processes.
export function useProctor(onFlag: (f: ProctorFlag) => void) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const lastFlag = useRef<Record<string, number>>({})
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [active, setActive] = useState(false)

  // Throttle repeated flags of the same type (default 4s).
  const flag = useCallback((f: ProctorFlag, minGapMs = 4000) => {
    const now = Date.now()
    if (now - (lastFlag.current[f.type] || 0) < minGapMs) return
    lastFlag.current[f.type] = now
    onFlag(f)
  }, [onFlag])

  const stop = useCallback(() => {
    cleanupRef.current.forEach((fn) => { try { fn() } catch { /* noop */ } })
    cleanupRef.current = []
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.()
    setCameraOn(false); setMicOn(false); setActive(false)
  }, [])

  const start = useCallback(async (opts: StartOpts) => {
    setActive(true)

    // Fullscreen (best-effort; webkit fallback for Safari).
    const el = (containerRef.current || document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    try { await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()) } catch { /* denied */ }

    // Focus / visibility / fullscreen-exit / copy-paste listeners.
    const onVis = () => { if (document.hidden) flag({ type: 'tab_hidden', severity: 'high' }) }
    const onBlur = () => flag({ type: 'window_blur', severity: 'medium' })
    const onFsChange = () => {
      const d = document as Document & { webkitFullscreenElement?: Element }
      if (!document.fullscreenElement && !d.webkitFullscreenElement) flag({ type: 'fullscreen_exit', severity: 'high' })
    }
    const onCopy = () => flag({ type: 'copy', severity: 'medium' })
    const onPaste = () => flag({ type: 'paste', severity: 'medium' })
    const onCtx = (e: Event) => { e.preventDefault(); flag({ type: 'context_menu', severity: 'low' }) }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    document.addEventListener('contextmenu', onCtx)
    cleanupRef.current.push(
      () => document.removeEventListener('visibilitychange', onVis),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('fullscreenchange', onFsChange),
      () => document.removeEventListener('webkitfullscreenchange', onFsChange),
      () => document.removeEventListener('copy', onCopy),
      () => document.removeEventListener('paste', onPaste),
      () => document.removeEventListener('contextmenu', onCtx),
    )

    // Camera + mic (consent-based).
    if (opts.camera || opts.mic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: opts.camera, audio: opts.mic })
        streamRef.current = stream
        if (opts.camera) {
          setCameraOn(true)
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
          const track = stream.getVideoTracks()[0]
          if (track) track.addEventListener('ended', () => flag({ type: 'camera_off', severity: 'high' }, 1000))
          cleanupRef.current.push(startFaceWatch(flag))
        }
        if (opts.mic && stream.getAudioTracks().length) {
          setMicOn(true)
          cleanupRef.current.push(startMicWatch(stream, flag))
        }
      } catch {
        flag({ type: 'media_denied', severity: 'medium' }, 1000)
      }
    }
  }, [flag])

  return { containerRef, videoRef, cameraOn, micOn, active, start, stop }
}

// Periodic face check using the experimental FaceDetector where available.
// Returns a cleanup function.
function startFaceWatch(flag: (f: ProctorFlag, gap?: number) => void): () => void {
  const FD = (window as unknown as { FaceDetector?: new (o?: unknown) => { detect: (v: unknown) => Promise<unknown[]> } }).FaceDetector
  if (!FD) return () => {}
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const detector = new FD({ fastMode: true })
  const tick = async () => {
    if (stopped) return
    const video = document.querySelector('video[data-proctor]') as HTMLVideoElement | null
    if (video && video.readyState >= 2) {
      try {
        const faces = await detector.detect(video)
        if (faces.length === 0) flag({ type: 'no_face', severity: 'medium' }, 8000)
        else if (faces.length > 1) flag({ type: 'multiple_faces', severity: 'high' }, 8000)
      } catch { /* detection unavailable */ }
    }
    timer = setTimeout(tick, 4000)
  }
  timer = setTimeout(tick, 4000)
  return () => { stopped = true; if (timer) clearTimeout(timer) }
}

// Microphone level watch: sustained loud audio => likely talking.
// Returns a cleanup function.
function startMicWatch(stream: MediaStream, flag: (f: ProctorFlag, gap?: number) => void): () => void {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return () => {}
  const ctx = new Ctx()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  src.connect(analyser)
  const buf = new Uint8Array(analyser.frequencyBinCount)
  let loudFrames = 0
  let raf = 0
  const loop = () => {
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let k = 0; k < buf.length; k++) { const v = (buf[k] - 128) / 128; sum += v * v }
    const rms = Math.sqrt(sum / buf.length)
    if (rms > 0.12) { loudFrames++; if (loudFrames > 30) { flag({ type: 'mic_noise', severity: 'low', details: { level: Math.round(rms * 100) } }, 6000); loudFrames = 0 } }
    else loudFrames = Math.max(0, loudFrames - 1)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => { cancelAnimationFrame(raf); ctx.close().catch(() => {}) }
}
