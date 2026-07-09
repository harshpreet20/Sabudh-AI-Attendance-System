'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Bell, X } from 'lucide-react'
import { pushSupported, ensureNotificationsEnabled } from '@/lib/push-client'

const DISMISS_KEY = 'sabudh.notif_prompt_dismissed_at'
const REPROMPT_MS = 3 * 24 * 60 * 60 * 1000 // re-ask after 3 days if dismissed

// Prominent, dismissible banner that drives notification-permission grants.
// Native OS notifications (mobile / tablet / laptop) require permission, so this
// is the one thing standing between a logged-in user and getting proper pushes.
export function EnableNotificationsPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported()) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return // granted or denied -> nothing to prompt
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
      if (dismissedAt && Date.now() - dismissedAt < REPROMPT_MS) return
    } catch {
      // ignore storage errors
    }
    setShow(true)
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const ok = await ensureNotificationsEnabled()
      if (ok) {
        toast.success('Notifications on — you\'ll now get alerts on this device.')
        setShow(false)
      } else {
        toast.error('Notifications were blocked. You can enable them in your browser/site settings.')
        setShow(false)
      }
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
      <div className="rounded-xl bg-indigo-100 p-2 shrink-0">
        <Bell className="h-5 w-5 text-indigo-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-indigo-900">Turn on notifications</p>
        <p className="text-xs text-indigo-700/80">
          Get attendance, class and reminder alerts as real notifications on your phone, tablet and laptop.
          On iPhone, add this app to your Home Screen first.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" onClick={enable} loading={busy} disabled={busy}>
          Enable
        </Button>
        <button
          onClick={dismiss}
          className="rounded-lg p-1.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
