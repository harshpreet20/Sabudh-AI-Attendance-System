'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Dynamic QR fields (present when the code rotates).
  rotating?: boolean
  step_seconds?: number
  current_code?: string
  content?: string
  next_rotation_ms?: number
}

const TTL_OPTIONS = [
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
]

// Faculty-facing QR Backup Mode control. Generates a DYNAMIC QR code for the
// active session — the code rotates every 15 seconds, so a screenshot is
// worthless within moments (defeating "photograph and share" proxy attendance).
// Attendance is an either/or: a student marks presence with the verification
// word OR by scanning this live QR. GPS verification still runs server-side.
export function QrBackupPanel({ sessionId }: { sessionId: string }) {
  const [token, setToken] = useState<QrToken | null>(null)
  const [dataUrl, setDataUrl] = useState<string>('')
  const [ttl, setTtl] = useState(900)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [rotateIn, setRotateIn] = useState(0)

  const render = useCallback(async (content: string) => {
    const url = await QRCode.toDataURL(content, { width: 260, margin: 1 })
    setDataUrl(url)
  }, [])

  const applyToken = useCallback((data: QrToken) => {
    setToken(data)
    render(data.content || data.token)
  }, [render])

  const loadActive = useCallback(async () => {
    const res = await fetch(`/api/teacher/qr?session_id=${sessionId}`)
    const json = await res.json()
    if (json.success && json.data) applyToken(json.data)
  }, [sessionId, applyToken])

  useEffect(() => {
    loadActive()
  }, [loadActive])

  // Overall session-window countdown + auto-expire.
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

  // Rotation: pull the fresh code each 15s window and re-render the QR. Keyed on
  // the token id so it survives the per-tick content updates it makes itself.
  const rotatingRef = useRef(false)
  useEffect(() => {
    if (!token?.rotating || !token.id) return
    let rotatesAt = Date.now() + (token.next_rotation_ms ?? 15000)
    rotatingRef.current = false

    const id = setInterval(async () => {
      const now = Date.now()
      if (now >= rotatesAt && !rotatingRef.current) {
        rotatingRef.current = true
        try {
          const res = await fetch(`/api/teacher/qr?session_id=${sessionId}`)
          const json = await res.json()
          if (json.success && json.data?.content) {
            render(json.data.content)
            setToken((prev) => (prev ? { ...prev, content: json.data.content, current_code: json.data.current_code, use_count: json.data.use_count } : prev))
            rotatesAt = now + (json.data.next_rotation_ms ?? 15000)
          } else {
            rotatesAt = now + 15000
          }
        } catch {
          rotatesAt = now + 15000
        } finally {
          rotatingRef.current = false
        }
      }
      setRotateIn(Math.max(0, Math.ceil((rotatesAt - Date.now()) / 1000)))
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token?.id, token?.rotating, sessionId, render])

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
      applyToken(json.data)
      toast.success('Live QR code started')
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
            <p className="text-sm text-sky-800 mt-0.5">A live QR that refreshes every 15 seconds — students scan it instead of the verification word. GPS is still verified, and a screenshot expires almost instantly.</p>
          </div>
        </div>

        {token && dataUrl ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt="Attendance QR code" className="rounded-lg bg-white p-2 shadow" width={220} height={220} />
              {token.rotating && (
                <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                  <RefreshCw className="h-3 w-3 animate-spin [animation-duration:3s]" />
                  {rotateIn}s
                </span>
              )}
            </div>
            <div className="text-center">
              {token.rotating && (
                <p className="text-xs text-sky-700 font-medium">Refreshes every {token.step_seconds ?? 15}s · new code in {rotateIn}s</p>
              )}
              <p className="text-2xl font-bold font-mono text-sky-900">{mm}:{ss}</p>
              <p className="text-xs text-gray-500">
                session open · {token.use_count} scan{token.use_count === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={generate} loading={busy}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> New session
              </Button>
              <Button size="sm" variant="destructive" onClick={revoke}>
                <X className="h-3.5 w-3.5 mr-1" /> Stop
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
              <QrCode className="h-4 w-4 mr-1" /> Start live QR
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
