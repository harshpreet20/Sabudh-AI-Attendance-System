/* Sabudh AI Attendance — service worker for Web Push notifications. */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Sabudh AI Attendance', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Sabudh AI Attendance'
  const options = {
    body: payload.body || '',
    icon: '/sabudh-logo.png',
    badge: '/sabudh-logo.png',
    data: payload.metadata || {},
    tag: payload.type || 'notification',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Periodic Background Sync — the PWA-native, cron-free way to fire randomized
// re-engagement nudges. The browser wakes the SW on its own cadence (Chromium,
// installed PWA, sufficient site engagement); we ask the server whether this
// user is "due" and, if so, show a fresh AI-generated notification locally.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'engagement-nudge') {
    event.waitUntil(runEngagementNudge())
  }
})

// Also handle a one-off sync as a fallback trigger (e.g. registered on reconnect).
self.addEventListener('sync', (event) => {
  if (event.tag === 'engagement-nudge') {
    event.waitUntil(runEngagementNudge())
  }
})

async function runEngagementNudge() {
  try {
    const res = await fetch('/api/engagement/self-nudge', { credentials: 'same-origin' })
    if (!res.ok) return
    const data = await res.json()
    if (data && data.notify && data.title) {
      await self.registration.showNotification(data.title, {
        body: data.body || '',
        icon: '/sabudh-logo.png',
        badge: '/sabudh-logo.png',
        tag: 'engagement-nudge',
        data: { source: 'self_nudge' },
      })
    }
  } catch {
    // offline or not signed in — try again next cycle
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = '/dashboard/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
