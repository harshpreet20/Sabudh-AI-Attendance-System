'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  Megaphone,
  X,
  Pin,
} from 'lucide-react'
import type { Announcement } from '@/types/database'

interface PriorityAnnouncementsProps {
  batchId: string | null
  organizationId: string
}

export function PriorityAnnouncements({ batchId, organizationId }: PriorityAnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const now = new Date().toISOString()

      let query = supabase
        .from('announcements')
        .select('*')
        .eq('organization_id', organizationId)
        .in('priority', ['high', 'urgent'])
        .lte('published_at', now)
        .order('published_at', { ascending: false })
        .limit(5)

      const { data } = await query

      const filtered = (data as Announcement[] ?? []).filter(a => {
        if (a.expires_at && new Date(a.expires_at) < new Date()) return false
        if (a.batch_id && a.batch_id !== batchId) return false
        return true
      })

      setAnnouncements(filtered)
    }

    fetch()
  }, [batchId, organizationId])

  const visible = announcements.filter(a => !dismissed.has(a.id))

  if (visible.length === 0) return null

  return (
    <div className="space-y-3">
      {visible.map((a) => {
        const isUrgent = a.priority === 'urgent'
        return (
          <div
            key={a.id}
            className={`relative rounded-xl border p-4 backdrop-blur-sm ${
              isUrgent
                ? 'border-red-300/50 bg-red-50/70'
                : 'border-amber-300/50 bg-amber-50/70'
            }`}
          >
            <button
              onClick={() => setDismissed(prev => new Set(prev).add(a.id))}
              className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 hover:bg-white/50 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-8">
              {isUrgent ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              ) : (
                <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-semibold ${isUrgent ? 'text-red-800' : 'text-amber-800'}`}>
                    {a.title}
                  </h3>
                  <Badge variant={isUrgent ? 'destructive' : 'warning'} className="text-xs">
                    {a.priority.toUpperCase()}
                  </Badge>
                  {a.is_pinned && <Pin className="h-3 w-3 text-gray-400" />}
                </div>
                <p className={`mt-1 text-sm ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
                  {a.content}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(a.published_at).toLocaleDateString('en-IN', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
