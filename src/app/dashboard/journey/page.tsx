'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import {
  UserPlus,
  CheckCircle2,
  Users,
  BookOpen,
  Hand,
  ClipboardCheck,
  MessageSquare,
  Award,
  Star,
  TrendingUp,
  FolderKanban,
  MapPin,
} from 'lucide-react'
import type { StudentJourneyEvent } from '@/types/database'

const EVENT_ICONS: Record<string, React.ElementType> = {
  registered: UserPlus,
  approved: CheckCircle2,
  batch_assigned: Users,
  first_attendance: Hand,
  profile_completed: Star,
  assignment_submitted: ClipboardCheck,
  project_submitted: FolderKanban,
  discussion_started: MessageSquare,
  milestone_25: TrendingUp,
  milestone_50: TrendingUp,
  milestone_75: TrendingUp,
  certificate_eligible: Award,
  status_change: MapPin,
  suspended: MapPin,
  expelled: MapPin,
  archived: MapPin,
}

const EVENT_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-600',
  approved: 'bg-emerald-100 text-emerald-600',
  batch_assigned: 'bg-violet-100 text-violet-600',
  first_attendance: 'bg-amber-100 text-amber-600',
  profile_completed: 'bg-indigo-100 text-indigo-600',
  assignment_submitted: 'bg-teal-100 text-teal-600',
  project_submitted: 'bg-pink-100 text-pink-600',
  discussion_started: 'bg-orange-100 text-orange-600',
  milestone_25: 'bg-cyan-100 text-cyan-600',
  milestone_50: 'bg-lime-100 text-lime-600',
  milestone_75: 'bg-emerald-100 text-emerald-600',
  certificate_eligible: 'bg-yellow-100 text-yellow-600',
  suspended: 'bg-red-100 text-red-600',
  expelled: 'bg-red-100 text-red-600',
  archived: 'bg-gray-100 text-gray-600',
}

interface JourneyStats {
  totalEvents: number
  daysOnPlatform: number
  attendanceRate: number
  assignmentsCompleted: number
  discussionPosts: number
  projectsSubmitted: number
  currentStatus: string
  batchName: string | null
}

export default function StudentJourneyPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<StudentJourneyEvent[]>([])
  const [stats, setStats] = useState<JourneyStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchJourney = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, status, batch_id, attendance_percentage, present_count, created_at')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) { setLoading(false); return }

    const { data: journeyEvents } = await supabase
      .from('student_journey_events')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })

    setEvents(journeyEvents ?? [])

    let batchName: string | null = null
    if (profile.batch_id) {
      const { data: batch } = await supabase
        .from('batches')
        .select('name')
        .eq('id', profile.batch_id)
        .single()
      batchName = batch?.name ?? null
    }

    const { count: assignmentCount } = await supabase
      .from('assignment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', profile.id)

    const { count: discussionCount } = await supabase
      .from('discussion_threads')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', user.id)

    const { count: replyCount } = await supabase
      .from('discussion_replies')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', user.id)

    const { count: projectCount } = await supabase
      .from('project_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', profile.id)

    const daysOnPlatform = Math.max(1, Math.floor(
      (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ))

    setStats({
      totalEvents: journeyEvents?.length ?? 0,
      daysOnPlatform,
      attendanceRate: profile.attendance_percentage ?? 0,
      assignmentsCompleted: assignmentCount ?? 0,
      discussionPosts: (discussionCount ?? 0) + (replyCount ?? 0),
      projectsSubmitted: projectCount ?? 0,
      currentStatus: profile.status,
      batchName,
    })

    // Check and create milestone events that don't exist yet
    const eventTypes = new Set(journeyEvents?.map(e => e.event_type) ?? [])

    if ((assignmentCount ?? 0) > 0 && !eventTypes.has('assignment_submitted')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'assignment_submitted',
        title: 'First Assignment Submitted',
        description: 'You submitted your first assignment!',
      })
    }

    if ((projectCount ?? 0) > 0 && !eventTypes.has('project_submitted')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'project_submitted',
        title: 'First Project Submitted',
        description: 'You submitted your first project!',
      })
    }

    if (((discussionCount ?? 0) + (replyCount ?? 0)) > 0 && !eventTypes.has('discussion_started')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'discussion_started',
        title: 'Joined Discussions',
        description: 'You made your first post or reply in discussions!',
      })
    }

    const attendance = profile.attendance_percentage ?? 0
    if (attendance >= 25 && !eventTypes.has('milestone_25')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'milestone_25',
        title: '25% Attendance Milestone',
        description: 'You reached 25% attendance. Keep going!',
      })
    }
    if (attendance >= 50 && !eventTypes.has('milestone_50')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'milestone_50',
        title: '50% Attendance Milestone',
        description: 'Halfway there! You reached 50% attendance.',
      })
    }
    if (attendance >= 75 && !eventTypes.has('milestone_75')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'milestone_75',
        title: '75% Attendance Milestone',
        description: 'Excellent! You reached 75% attendance.',
      })
    }
    if (attendance >= 80 && !eventTypes.has('certificate_eligible')) {
      await supabase.from('student_journey_events').insert({
        student_id: profile.id,
        event_type: 'certificate_eligible',
        title: 'Certificate Eligible',
        description: 'You are now eligible for a completion certificate!',
      })
    }

    // Re-fetch if new events were created
    const newEventTypes = [
      (assignmentCount ?? 0) > 0 && !eventTypes.has('assignment_submitted'),
      (projectCount ?? 0) > 0 && !eventTypes.has('project_submitted'),
      ((discussionCount ?? 0) + (replyCount ?? 0)) > 0 && !eventTypes.has('discussion_started'),
      attendance >= 25 && !eventTypes.has('milestone_25'),
      attendance >= 50 && !eventTypes.has('milestone_50'),
      attendance >= 75 && !eventTypes.has('milestone_75'),
      attendance >= 80 && !eventTypes.has('certificate_eligible'),
    ]

    if (newEventTypes.some(Boolean)) {
      const { data: refreshed } = await supabase
        .from('student_journey_events')
        .select('*')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: false })
      setEvents(refreshed ?? [])
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJourney() }, [fetchJourney])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!stats) {
    return (
      <EmptyState
        icon={MapPin}
        title="Journey not found"
        description="No student profile found for your account."
      />
    )
  }

  const journeyProgress = Math.min(100, Math.round(
    (stats.totalEvents / 10) * 100
  ))

  const statusColor = {
    pending: 'warning',
    active: 'success',
    suspended: 'destructive',
    expelled: 'destructive',
    archived: 'secondary',
  } as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Learning Journey</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track your progress and milestones on the Sabudh AI platform
        </p>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Journey Progress</h2>
              <p className="text-sm text-gray-500">
                {stats.daysOnPlatform} days on platform · {stats.totalEvents} milestones achieved
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={statusColor[stats.currentStatus as keyof typeof statusColor] ?? 'secondary'}>
                {stats.currentStatus}
              </Badge>
              {stats.batchName && (
                <Badge variant="default">{stats.batchName}</Badge>
              )}
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">Overall Progress</span>
              <span className="font-medium text-gray-900">{journeyProgress}%</span>
            </div>
            <Progress value={journeyProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="mx-auto h-6 w-6 text-indigo-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.attendanceRate}%</p>
            <p className="text-xs text-gray-500">Attendance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="mx-auto h-6 w-6 text-teal-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.assignmentsCompleted}</p>
            <p className="text-xs text-gray-500">Assignments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="mx-auto h-6 w-6 text-amber-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.discussionPosts}</p>
            <p className="text-xs text-gray-500">Discussion Posts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FolderKanban className="mx-auto h-6 w-6 text-pink-500" />
            <p className="mt-2 text-2xl font-bold text-gray-900">{stats.projectsSubmitted}</p>
            <p className="text-xs text-gray-500">Projects</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            Journey Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No events yet"
              description="Your journey events will appear here as you progress."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />

              <div className="space-y-6">
                {events.map((event, index) => {
                  const Icon = EVENT_ICONS[event.event_type] ?? MapPin
                  const colorClass = EVENT_COLORS[event.event_type] ?? 'bg-gray-100 text-gray-600'

                  return (
                    <div key={event.id} className="relative flex gap-4 pl-0">
                      {/* Icon */}
                      <div className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
                          {index === 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">Latest</Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="mt-0.5 text-sm text-gray-500">{event.description}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(event.created_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
