'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface PushMessage {
  type: string
  payload?: { title?: string; body?: string; url?: string }
}

/**
 * Shows a consistent in-app popup whenever a push notification arrives while
 * the app is open — the same experience on every OS/browser, and dismissible
 * right from the toast. The tap opens the relevant page. Renders nothing.
 */
export function NotificationListener() {
  const router = useRouter()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent<PushMessage>) => {
      const data = event.data
      if (!data || data.type !== 'push' || !data.payload) return
      const { title, body, url } = data.payload
      toast(title || 'Sabudh AI', {
        description: body,
        duration: 8000,
        action: url
          ? {
              label: 'View',
              onClick: () => router.push(url),
            }
          : undefined,
      })
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [router])

  return null
}
