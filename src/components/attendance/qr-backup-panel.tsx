'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QrCode, RefreshCw, X } from 'lucide-react'

interface QrToken {
  id: string
  token: string
  session_id: string
  expires_at: string
  use_count: number
  max_uses: number | null
}

const TTL_OPTIONS = [
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
]

// Faculty-facing QR Backup Mode control. Generates a time-limited QR code for
// the active session that students scan when camera/selfie verification fails.
// GPS verification still runs server-side on scan.
export function QrBackupPanel({ sessionId }: { sessionId: string }) {
  const [token, setToken] = useState<QrToken | null>(null)
  const [dataUrl, setDataUrl] = useState<string>('')
  const [ttl, setTtl] = useState(300)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)

  const render = useCallback(async (t: QrToken) => {
    // The QR encodes just the opaque token; the scan endpoint resolves the session.
    const url = await QRCode.toDataURL(t.token, { width: 260, margin: 1 })
    setDataUrl(url)
  }, [])

  const loadActive = useCallback(async () => {
    const res = await fetch(`/api/teacher/qr?session_id=${sessionId}`)
    const json = await res.json()
    if (json.success && json.data) {
      setToken(json.data)
      render(json.data)
    }
  }, [sessionId, render])

  useEffect(() => {
    loadActive()
  }, [loadActive])

  // Countdown + auto-expire.
  useEffect(() => {
    if (!token) return
    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(token.expires_at).getTime() - Date.now()) / 1000))
      setRemaining(secs)
      if (secs === 0) {
        setToken(null)
        setDataUrl('')
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [token])

  async function generate() {
    setBusy(true)
    try {
      const res = await fetch('/api/teacher/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, ttl_seconds: ttl }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error?.message || 'Failed to generate QR')
        return
      }
      setToken(json.data)
      render(json.data)
      toast.success('QR code generated')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    await fetch(`/api/teacher/qr?session_id=${sessionId}`, { method: 'DELETE' })
    setToken(null)
    setDataUrl('')
    toast.message('QR code revoked')
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <Card className="!bg-sky-50/60 !border-sky-200/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-xl bg-sky-100 p-2.5">
            <QrCode className="h-5 w-5 text-sky-700" />
          </div>
          <div>
            <p className="text-xs font-medium text-sky-600 uppercase tracking-wider">QR Backup Mode</p>
            <p className="text-sm text-sky-800 mt-0.5">Fallback attendance when camera/GPS verification fails. Students still need GPS to be verified.</p>
          </div>
        </div>

        {token && dataUrl ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt="Attendance QR code" className="rounded-lg bg-white p-2 shadow" width={220} height={220} />
            <div className="text-center">
              <p className="text-2xl font-bold font-mono text-sky-900">{mm}:{ss}</p>
              <p className="text-xs text-gray-500">
                until expiry · {token.use_count} scan{token.use_count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={generate} loading={busy}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
              </Button>
              <Button size="sm" variant="destructive" onClick={revoke}>
                <X className="h-3.5 w-3.5 mr-1" /> Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setTtl(o.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    ttl === o.value ? 'bg-sky-600 text-white' : 'bg-white/60 text-gray-600 hover:bg-white'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={generate} loading={busy} className="bg-sky-600 hover:bg-sky-700 text-white">
              <QrCode className="h-4 w-4 mr-1" /> Generate QR
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
