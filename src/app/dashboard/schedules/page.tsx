'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Calendar, Video, ExternalLink } from 'lucide-react'
import type { ClassSchedule } from '@/types/database'

const TYPE_LABELS: Record<string, string> = {
  class: 'Class',
  assessment: 'Assessment',
  topic: 'Topic',
  holiday: 'Holiday',
  event: 'Event',
}

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  class: 'default',
  assessment: 'destructive',
  topic: 'success',
  holiday: 'warning',
  event: 'secondary',
}

export default function StudentSchedulesPage() {
  const supabase = createClient()
  const [schedules, setSchedules] = useState<ClassSchedule[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSchedules = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile?.batch_id) {
      setLoading(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('class_schedules')
      .select('*')
      .eq('batch_id', profile.batch_id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .limit(30)

    setSchedules((data as ClassSchedule[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    )
  }

  const grouped = schedules.reduce<Record<string, ClassSchedule[]>>((acc, s) => {
    const key = s.scheduled_date
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upcoming Schedules</h1>
        <p className="mt-1 text-sm text-gray-500">View your upcoming classes, assessments, and events</p>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No upcoming schedules"
          description="There are no upcoming schedules at the moment."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h3 className="mb-3 text-sm font-semibold text-gray-500">
                {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              <div className="space-y-2">
                {items.map((schedule) => (
                  <Card key={schedule.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{schedule.title}</p>
                        <Badge variant={TYPE_BADGE_VARIANT[schedule.schedule_type] ?? 'secondary'}>
                          {TYPE_LABELS[schedule.schedule_type] ?? schedule.schedule_type}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        {schedule.start_time && (
                          <span>
                            {schedule.start_time}
                            {schedule.end_time ? ` — ${schedule.end_time}` : ''}
                          </span>
                        )}
                        {schedule.location && <span>{schedule.location}</span>}
                        {schedule.meeting_url && (
                          <a href={schedule.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500 font-medium">
                            <Video className="h-3.5 w-3.5" />
                            {schedule.meeting_provider === 'google_meet' ? 'Join Google Meet' : schedule.meeting_provider === 'zoom' ? 'Join Zoom' : schedule.meeting_provider === 'teams' ? 'Join Teams' : 'Join Meeting'}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {schedule.description && (
                        <p className="mt-2 text-sm text-gray-400">{schedule.description}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
