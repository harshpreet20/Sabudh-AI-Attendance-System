// Client helpers for the Instant Push Notifications feature. Registers the
// service worker and manages the browser's Web Push subscription.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getPushState(): Promise<'unsupported' | 'granted' | 'denied' | 'default'> {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as 'granted' | 'denied' | 'default'
}

// Register the SW, request permission, create a subscription and persist it.
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'Push is not supported on this device' }

  const keyRes = await fetch('/api/notifications/subscribe')
  const keyJson = await keyRes.json()
  const publicKey: string | null = keyJson?.data?.public_key
  if (!publicKey) {
    return { ok: false, reason: 'Push notifications are not configured on the server yet' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'Notification permission was denied' }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  })
  if (!res.ok) return { ok: false, reason: 'Failed to save subscription' }

  return { ok: true }
}

// Enable browser/PWA notifications with the minimum needed for realtime
// delivery: permission + a registered service worker. If VAPID is configured
// it also creates a background push subscription (best-effort).
export async function ensureNotificationsEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    // SW registration failed — realtime toast fallback still works
  }
  // Best-effort true-background push; harmless if VAPID isn't set up.
  subscribeToPush().catch(() => {})
  // Register the PWA self-scheduling engagement nudge (no server cron needed).
  registerEngagementSync().catch(() => {})
  return true
}

// Registers Periodic Background Sync so the installed PWA can wake itself and
// fire randomized re-engagement nudges without any server cron. Chromium-only
// and gated by the browser (installed PWA + site engagement); silently no-ops
// elsewhere. Falls back to a one-off background sync registration.
export async function registerEngagementSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> }
      sync?: { register: (tag: string) => Promise<void> }
    }

    if (reg.periodicSync) {
      // Ask for the periodic-background-sync permission if the API is available.
      let allowed = true
      try {
        const status = await (navigator.permissions as unknown as {
          query: (d: { name: string }) => Promise<{ state: string }>
        }).query({ name: 'periodic-background-sync' })
        allowed = status.state === 'granted'
      } catch {
        allowed = true // permission API not present — attempt registration anyway
      }
      if (allowed) {
        // Browser controls the true cadence; minInterval is a lower bound (~12h).
        await reg.periodicSync.register('engagement-nudge', { minInterval: 12 * 60 * 60 * 1000 })
        return
      }
    }

    // Fallback: one-off background sync (fires when connectivity is regained).
    if (reg.sync) {
      await reg.sync.register('engagement-nudge')
    }
  } catch {
    // Unsupported browser — the optional server cron still covers delivery.
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, { method: 'DELETE' })
    await subscription.unsubscribe()
  }
}
