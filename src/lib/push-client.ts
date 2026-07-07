import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from './pwa'

export type PushEnableResult = 'granted' | 'denied' | 'unsupported' | 'error'

/**
 * Request notification permission and register a push subscription for this
 * device. Returns a granular result so callers can show an accurate message:
 * - 'granted'     — permission granted and subscription saved
 * - 'denied'      — the user blocked/dismissed the browser prompt
 * - 'unsupported' — push isn't available/configured on this device
 * - 'error'       — permission was fine but subscribing/saving failed
 */
export async function enablePushNotifications(): Promise<PushEnableResult> {
  if (
    typeof window === 'undefined' ||
    !VAPID_PUBLIC_KEY ||
    typeof Notification === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported'
  }

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    return 'denied'
  }
  if (permission !== 'granted') return 'denied'

  try {
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
    return res.ok ? 'granted' : 'error'
  } catch (err) {
    console.error('Push subscription failed:', err)
    return 'error'
  }
}
