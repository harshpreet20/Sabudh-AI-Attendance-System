'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { pushSupported, registerEngagementSync } from '@/lib/push-client'

interface NotificationRow {
  id: string
  type: string
  title: string
  message: string
  metadata?: Record<string, unknown>
}

// Mounted once inside the dashboard shell for every role. Subscribes to the
// current user's notifications over Supabase Realtime and raises a browser /
// PWA notification (via the service worker) the instant a new row is inserted
// — which the DB triggers do for every student, discussion and message action.
// Falls back to an in-app toast when OS notifications aren't permitted.
export function NotificationsListener() {
  const registeredRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // Register the service worker up front. This powers BOTH background
    // notification delivery AND local asset caching, so it must run on every
    // platform that supports service workers — not only where Push is available.
    // (iOS Safari tabs, for example, support SW caching but not the Push API, so
    // gating on push capability would leave them with no cache at all.)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !registeredRef.current) {
      registeredRef.current = true
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // Push-only extras remain gated on push support + permission.
          if (pushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            registerEngagementSync().catch(() => {})
          }
        })
        .catch(() => {})

      // Best-effort durable storage so the cache survives eviction longer
      // (honoured on Chromium/Firefox/Android; iOS ignores it but still caches).
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => {})
      }
    }

    async function show(n: NotificationRow) {
      // Keep the bell badge in sync immediately.
      window.dispatchEvent(new CustomEvent('badges:refresh'))

      const canNotify =
        typeof Notification !== 'undefined' && Notification.permission === 'granted'

      if (canNotify && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready
          await reg.showNotification(n.title, {
            body: n.message,
            icon: '/sabudh-logo.png',
            badge: '/sabudh-logo.png',
            tag: n.id,
            data: n.metadata || {},
          })
          return
        } catch {
          // fall through to toast
        }
      }
      // Foreground fallback so the user still sees it.
      toast(n.title, { description: n.message })
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => show(payload.new as NotificationRow),
        )
        .subscribe()

      // Record activity so "last seen" stays current for staff dashboards.
      fetch('/api/activity/ping', { method: 'POST' }).catch(() => {})
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return null
}
