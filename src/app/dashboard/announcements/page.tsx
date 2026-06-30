'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Megaphone, Pin } from 'lucide-react'
import type { Announcement } from '@/types/database'

const PRIORITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  low: 'secondary',
  normal: 'default',
  high: 'warning',
  urgent: 'destructive',
}

export default function StudentAnnouncementsPage() {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAnnouncements = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('batch_id')
      .eq('auth_user_id', user.id)
      .single()

    let query = supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(50)

    if (profile?.batch_id) {
      query = query.or(`batch_id.is.null,batch_id.eq.${profile.batch_id}`)
    } else {
      query = query.is('batch_id', null)
    }

    const { data } = await query
    setAnnouncements((data as Announcement[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="mt-1 text-sm text-gray-500">Stay updated with the latest announcements from your teachers</p>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="There are no announcements for you at the moment."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-2">
                  {a.is_pinned && <Pin className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{a.title}</h3>
                      {a.priority !== 'normal' && (
                        <Badge variant={PRIORITY_VARIANT[a.priority] ?? 'secondary'}>
                          {a.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{a.content}</p>
                    <p className="mt-3 text-xs text-gray-400">
                      {new Date(a.published_at).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
