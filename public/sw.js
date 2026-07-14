/* Sabudh AI Attendance — service worker: Web Push + static-asset caching. */

// --- Static asset caching (PWA speed) --------------------------------------
// Cache-first for content-hashed build assets (immutable, so never stale) and
// stale-while-revalidate for other static files. Navigations, API calls and
// realtime always go to the network, so nothing dynamic is ever served stale.
const STATIC_CACHE = 'sabudh-static-v1'
const STATIC_RE = /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)$/

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('sabudh-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return

  const hashed = url.pathname.startsWith('/_next/static/')
  if (!hashed && !STATIC_RE.test(url.pathname)) return // leave navigations/API to the network

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE)
    const cached = await cache.match(req)
    if (cached) {
      if (!hashed) {
        // refresh non-hashed assets in the background
        event.waitUntil(fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()) }).catch(() => {}))
      }
      return cached
    }
    try {
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    } catch {
      return cached || Response.error()
    }
  })())
})

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
