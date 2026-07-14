'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Bell, X, CheckCircle2 } from 'lucide-react'
import { pushSupported, ensureNotificationsEnabled } from '@/lib/push-client'

const DISMISS_KEY = 'sabudh.notif_prompt_dismissed_at'
const MODAL_SHOWN_KEY = 'sabudh.notif_modal_shown'
const REPROMPT_MS = 3 * 24 * 60 * 60 * 1000 // re-ask via banner after 3 days

type Mode = 'none' | 'modal' | 'banner'

// Drives notification-permission grants. On the very first eligible visit it
// shows an assertive one-time modal; afterwards it falls back to a gentler,
// dismissible top-of-page banner (re-prompting every few days). Native OS
// notifications require permission, so this is the one gate for logged-in users.
export function EnableNotificationsPrompt() {
  const [mode, setMode] = useState<Mode>('none')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported() || typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return // granted or denied -> nothing to do
    try {
      if (!localStorage.getItem(MODAL_SHOWN_KEY)) {
        setMode('modal')
        return
      }
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
      if (!dismissedAt || Date.now() - dismissedAt >= REPROMPT_MS) {
        setMode('banner')
      }
    } catch {
      setMode('banner')
    }
  }, [])

  function markModalShown() {
    try {
      localStorage.setItem(MODAL_SHOWN_KEY, '1')
    } catch {
      // ignore
    }
  }

  async function enable() {
    setBusy(true)
    try {
      const ok = await ensureNotificationsEnabled()
      if (ok) {
        toast.success("Notifications on — you'll now get alerts on this device.")
      } else {
        toast.error('Notifications were blocked. You can re-enable them in your browser/site settings.')
      }
      markModalShown()
      setMode('none')
    } finally {
      setBusy(false)
    }
  }

  function laterFromModal() {
    // Move to the banner path so we still nudge later, but don't modal again.
    markModalShown()
    setMode('none')
  }

  function dismissBanner() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setMode('none')
  }

  if (mode === 'modal') {
    return (
      <Dialog open onClose={laterFromModal} title="">
        <div className="text-center px-2 pb-1">
          <div className="mx-auto mb-4 inline-flex rounded-2xl bg-indigo-100 p-4">
            <Bell className="h-8 w-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Stay in the loop</h2>
          <p className="mt-2 text-sm text-gray-600">
            Turn on notifications to get attendance windows, class updates, reminders and your
            nudges as real alerts on your phone, tablet and laptop.
          </p>
          <ul className="mt-4 space-y-2 text-left text-sm text-gray-700">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> Never miss an attendance window</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> Instant class & schedule updates</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> Works across all your devices</li>
          </ul>
          <p className="mt-3 text-xs text-gray-400">On iPhone, add this app to your Home Screen first.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={enable} loading={busy} disabled={busy} size="lg" className="w-full">
              Enable notifications
            </Button>
            <Button variant="ghost" onClick={laterFromModal} disabled={busy} className="w-full">
              Maybe later
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  if (mode === 'banner') {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
        <div className="rounded-xl bg-indigo-100 p-2 shrink-0">
          <Bell className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">Turn on notifications</p>
          <p className="text-xs text-indigo-700/80">
            Get attendance, class and reminder alerts as real notifications on your phone, tablet and laptop.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" onClick={enable} loading={busy} disabled={busy}>
            Enable
          </Button>
          <button
            onClick={dismissBanner}
            className="rounded-lg p-1.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
