'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { QrCode, Bell, BellOff, WifiOff, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { subscribeToPush, getPushState } from '@/lib/push-client'
import { readQueue, syncQueue, enqueue, newDedupKey, type QueueItem, type OfflineCapture } from '@/lib/offline-queue'

interface Coords {
  lat: number
  lng: number
  accuracy: number
}

interface Props {
  sessionId: string
  coords: Coords | null
  fingerprint: string | null
  onSuccess: (result: { attendance_id: string; status: string; flagged: boolean }) => void
}

// Minimal BarcodeDetector typing (not in the TS DOM lib yet).
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
}

export function AttendanceExtras({ coords, fingerprint, onSuccess }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <QrScanButton coords={coords} fingerprint={fingerprint} onSuccess={onSuccess} />
        <PushOptIn />
      </div>
      <OfflineStatus />
    </div>
  )
}

// --- QR scan / enter --------------------------------------------------------
// The QR token encodes its own session server-side, so the session id isn't
// needed here — only the student's live coords + fingerprint.
function QrScanButton({ coords, fingerprint, onSuccess }: Omit<Props, 'sessionId'>) {
  const [open, setOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  const submitToken = useCallback(
    async (token: string) => {
      if (!token.trim()) return
      if (!coords) {
        toast.error('Location is required. Please enable location access first.')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/attendance/qr-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token.trim(),
            latitude: coords.lat,
            longitude: coords.lng,
            location_accuracy: coords.accuracy,
            device_fingerprint: fingerprint,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error?.message || 'QR attendance failed')
          return
        }
        stopCamera()
        setOpen(false)
        onSuccess({ attendance_id: data.data.attendance_id, status: data.data.status, flagged: data.data.flagged })
        toast.success(data.data.message || 'Attendance recorded via QR')
      } finally {
        setSubmitting(false)
      }
    },
    [coords, fingerprint, onSuccess, stopCamera],
  )

  const startCamera = useCallback(async () => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    if (!Detector) {
      toast.message('Camera scanning is not supported on this browser — enter the code shown by your instructor.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScanning(true)
      const detector = new Detector({ formats: ['qr_code'] })
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0 && codes[0].rawValue) {
            await submitToken(codes[0].rawValue)
            return
          }
        } catch {
          // transient decode error — keep scanning
        }
        rafRef.current = requestAnimationFrame(scan)
      }
      rafRef.current = requestAnimationFrame(scan)
    } catch {
      toast.error('Could not access the camera')
    }
  }, [submitToken])

  useEffect(() => () => stopCamera(), [stopCamera])

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4 mr-2" /> Scan QR (backup)
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          stopCamera()
          setOpen(false)
        }}
        title="QR Backup Attendance"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Scan the QR code your instructor is displaying, or type the code below. Your GPS location is still verified.
          </p>
          <div className="rounded-xl overflow-hidden bg-black/80 aspect-video flex items-center justify-center">
            {scanning ? (
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            ) : (
              <Button variant="secondary" onClick={startCamera}>
                <QrCode className="h-4 w-4 mr-2" /> Start camera
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Or enter code"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
            />
            <Button onClick={() => submitToken(manualToken)} loading={submitting} disabled={submitting || !manualToken.trim()}>
              Submit
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

// --- Push opt-in ------------------------------------------------------------
function PushOptIn() {
  const [state, setState] = useState<'unsupported' | 'granted' | 'denied' | 'default'>('default')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState)
  }, [])

  if (state === 'unsupported') return null

  async function enable() {
    setBusy(true)
    try {
      const res = await subscribeToPush()
      if (res.ok) {
        setState('granted')
        toast.success('Push notifications enabled')
      } else {
        toast.error(res.reason || 'Could not enable notifications')
      }
    } finally {
      setBusy(false)
    }
  }

  if (state === 'granted') {
    return (
      <Button variant="secondary" disabled>
        <Bell className="h-4 w-4 mr-2" /> Notifications on
      </Button>
    )
  }

  return (
    <Button variant="secondary" onClick={enable} loading={busy} disabled={busy || state === 'denied'}>
      {state === 'denied' ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
      {state === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
    </Button>
  )
}

// --- Offline queue status ---------------------------------------------------
function OfflineStatus() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const refresh = useCallback(async () => {
    setItems(await readQueue())
  }, [])

  const doSync = useCallback(async () => {
    setSyncing(true)
    try {
      const updated = await syncQueue()
      setItems(updated)
      const justSynced = updated.filter((i) => i.status === 'synced').length
      if (justSynced > 0) toast.success(`Synced ${justSynced} offline attendance record(s)`)
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onOnline = () => {
      setOnline(true)
      doSync()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Attempt a sync on mount in case items are left over.
    if (navigator.onLine) doSync()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh, doSync])

  const pending = items.filter((i) => i.status === 'pending' || i.status === 'error' || i.status === 'syncing')
  if (items.length === 0 && online) return null

  return (
    <Card className="!bg-slate-50/60 !border-slate-200/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <WifiOff className={`h-4 w-4 ${online ? 'text-gray-400' : 'text-amber-500'}`} />
            <span>{online ? 'Online' : 'Offline — attendance will sync when reconnected'}</span>
          </div>
          {pending.length > 0 && (
            <Button size="sm" variant="secondary" onClick={doSync} loading={syncing} disabled={!online || syncing}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync {pending.length}
            </Button>
          )}
        </div>
        {items.length > 0 && (
          <div className="mt-2 space-y-1">
            {items.map((i) => (
              <div key={i.client_dedup_key} className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{new Date(i.captured_at).toLocaleString('en-IN')}</span>
                <QueueBadge item={i} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QueueBadge({ item }: { item: QueueItem }) {
  if (item.status === 'synced') return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Synced</Badge>
  if (item.status === 'rejected') return <Badge variant="destructive" title={item.reason}><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
  if (item.status === 'error') return <Badge variant="warning">Retry pending</Badge>
  return <Badge variant="secondary">Pending</Badge>
}

// Helper other modules can call to queue a capture when a live submit fails.
export async function queueOfflineCapture(capture: Omit<OfflineCapture, 'client_dedup_key' | 'captured_at'>): Promise<void> {
  await enqueue({
    ...capture,
    client_dedup_key: newDedupKey(capture.session_id),
    captured_at: new Date().toISOString(),
  })
}
