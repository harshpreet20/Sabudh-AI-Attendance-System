'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
import { X, CheckCircle2, Users, Loader2 } from 'lucide-react'

interface PresentRow {
  id: string
  student_id: string
  submitted_at: string | null
  decision: string | null
  student_profiles: { full_name: string; profile_image_url: string | null } | null
}

interface TakeAttendanceQrProps {
  sessionId: string
  label: string
  onClose: () => void
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  return `${mins}m ago`
}

/**
 * Full-screen teacher view: shows a QR that rotates every ~10s and a live feed
 * of students marking present ("{Name} just marked present"). Students scan it
 * in the app. Poll-based so it works without realtime configuration.
 */
export function TakeAttendanceQr({ sessionId, label, onClose }: TakeAttendanceQrProps) {
  const supabaseRef = useRef(createClient())
  const seenIds = useRef<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [present, setPresent] = useState<PresentRow[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Rotate the QR: fetch a fresh short-lived token and render it.
  useEffect(() => {
    let active = true
    async function rotate() {
      try {
        const res = await fetch(`/api/attendance/qr-token?session_id=${sessionId}`)
        const json = await res.json()
        if (!active || !json.success) return
        const url = await QRCode.toDataURL(json.data.token, {
          width: 320,
          margin: 1,
          color: { dark: '#1e1b4b', light: '#ffffff' },
        })
        if (active) setQrUrl(url)
      } catch {
        /* keep the last QR on transient errors */
      }
    }
    rotate()
    const iv = setInterval(rotate, 10000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [sessionId])

  const poll = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from('attendance')
      .select(
        'id, student_id, submitted_at, decision, student_profiles(full_name, profile_image_url)'
      )
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: false })

    const rows = ((data as unknown as PresentRow[]) ?? []).filter(
      (r) => r.decision !== 'rejected'
    )

    const isFirst = seenIds.current.size === 0
    const fresh = rows.filter((r) => !seenIds.current.has(r.id))
    if (!isFirst && fresh.length > 0) {
      setBanner(fresh[0].student_profiles?.full_name ?? 'Someone')
      setTimeout(() => setBanner(null), 4500)
    }
    rows.forEach((r) => seenIds.current.add(r.id))
    setPresent(rows)
  }, [sessionId])

  // Live feed poll.
  useEffect(() => {
    poll()
    const iv = setInterval(poll, 3000)
    return () => clearInterval(iv)
  }, [poll])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-gradient-to-b from-indigo-950 to-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">
            Taking attendance
          </p>
          <p className="truncate text-sm font-semibold">{label}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20"
          aria-label="Done"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-8 lg:flex-row">
        {/* QR */}
        <div className="flex flex-col items-center justify-center lg:w-1/2">
          <div className="rounded-3xl bg-white p-5 shadow-2xl">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="Attendance QR" className="h-64 w-64 sm:h-72 sm:w-72" />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            )}
          </div>
          <p className="mt-5 text-center text-lg font-semibold">
            Scan to mark attendance
          </p>
          <p className="mt-1 text-center text-sm text-indigo-200">
            Open the Sabudh AI app → Attendance → Scan. The code refreshes
            automatically.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-indigo-300" />
            {present.length} marked present
          </div>
        </div>

        {/* Live feed */}
        <div className="lg:w-1/2">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </div>

          {present.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-indigo-200">
              Waiting for the first student to scan…
            </div>
          ) : (
            <ul className="space-y-2">
              {present.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 ${
                    i === 0 ? 'bg-emerald-500/15' : 'bg-white/5'
                  }`}
                >
                  <Avatar
                    src={r.student_profiles?.profile_image_url}
                    fallback={(r.student_profiles?.full_name ?? '?').slice(0, 1)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {r.student_profiles?.full_name ?? 'Student'}
                    </p>
                    <p className="text-xs text-indigo-300">
                      marked present · {timeAgo(r.submitted_at)}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* "Just marked present" banner */}
      {banner && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4">
            <CheckCircle2 className="h-5 w-5" />
            {banner} just marked present
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
