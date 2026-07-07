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

/**
 * Trigger the browser camera permission prompt. Returns true if access was
 * granted. Stops the stream immediately — we only want the permission grant.
 */
export async function enableCameraAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch {
    return false
  }
}
