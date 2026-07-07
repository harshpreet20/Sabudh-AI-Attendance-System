import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from './pwa'

/**
 * Request notification permission and register a push subscription for this
 * device. Returns true only when the subscription was saved server-side.
 * Safe to call when unconfigured or unsupported — it just returns false.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !VAPID_PUBLIC_KEY ||
    typeof Notification === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return false
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

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
  return res.ok
}
