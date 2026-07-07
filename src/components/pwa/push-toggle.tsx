'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Bell, Send } from 'lucide-react'
import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from '@/lib/pwa'

export function PushToggle() {
  const [mounted, setMounted] = useState(false)
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [denied, setDenied] = useState(false)

  const refreshState = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setEnabled(Boolean(sub))
    } catch {
      setEnabled(false)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Client-only capability checks; deferred to an effect to keep SSR output stable.
    setMounted(true)
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      Boolean(VAPID_PUBLIC_KEY)
    setSupported(ok)
    if (!ok) return
    setDenied(Notification.permission === 'denied')
    refreshState()
  }, [refreshState])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function enable() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setDenied(permission === 'denied')
        toast.error('Notification permission was not granted.')
        return
      }

      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      })
      if (!res.ok) throw new Error('save failed')

      setEnabled(true)
      toast.success('Push notifications enabled.')
    } catch (err) {
      console.error('Enable push failed:', err)
      toast.error('Could not enable push notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }
      setEnabled(false)
      toast.success('Push notifications disabled.')
    } catch (err) {
      console.error('Disable push failed:', err)
      toast.error('Could not disable push notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      if (res.ok) {
        toast.success('Test notification sent.')
      } else {
        toast.error('Could not send a test notification.')
      }
    } catch {
      toast.error('Could not send a test notification.')
    } finally {
      setTesting(false)
    }
  }

  if (!mounted) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-gray-500" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-gray-500">
            Push notifications aren&apos;t available on this device or browser
            yet. For the best experience, install the app and open it from your
            home screen.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-gray-900">
                  Notify me on this device
                </p>
                <p className="text-sm text-gray-500">
                  Get alerts for attendance windows, announcements, and results —
                  even when the app is closed.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={enabled}
                disabled={busy}
                onClick={enabled ? disable : enable}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                  enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {denied && !enabled && (
              <p className="text-xs text-amber-600">
                Notifications are blocked for this site. Enable them in your
                browser settings, then try again.
              </p>
            )}

            {enabled && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTest}
                  loading={testing}
                >
                  <Send className="h-4 w-4" />
                  Send test
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
