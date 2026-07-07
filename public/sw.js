/* Sabudh AI Attendance System — service worker.
 * Enables PWA installability and Web Push notifications. */

const APP_ICON = '/icons/icon-192.png'
const BADGE_ICON = '/icons/icon-192.png'

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// A pass-through fetch handler is enough to satisfy installability checks.
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Sabudh AI', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Sabudh AI'
  const url = payload.url || '/dashboard/notifications'
  const options = {
    body: payload.body || '',
    icon: payload.icon || APP_ICON,
    badge: BADGE_ICON,
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url },
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      // Also notify any open app windows so they can show a consistent in-app
      // popup regardless of the operating system.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clients) {
        client.postMessage({
          type: 'push',
          payload: { title, body: options.body, url },
        })
      }
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is already open, otherwise open a new one.
      for (const client of clientList) {
        const url = new URL(client.url)
        if (url.pathname === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
