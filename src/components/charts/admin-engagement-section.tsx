'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EngagementRadialChart,
  EngagementLineChart,
  EngagementRadarChart,
} from './engagement-charts'

export function AdminEngagementSection() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [radialData, setRadialData] = useState<{ name: string; value: number; fill: string }[]>([])
  const [lineData, setLineData] = useState<{ label: string; attendance: number; assignments: number; discussions: number }[]>([])
  const [radarData, setRadarData] = useState<{ metric: string; score: number; fullMark: number }[]>([])

  const fetchData = useCallback(async () => {
    const { data: students } = await supabase
      .from('student_profiles')
      .select('attendance_percentage')
      .eq('status', 'active')

    const avgAttendance = students && students.length > 0
      ? Math.round(students.reduce((s, st) => s + (st.attendance_percentage ?? 0), 0) / students.length)
      : 0

    const { count: totalAssignments } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    const { count: submittedAssignments } = await supabase
      .from('assignment_submissions')
      .select('*', { count: 'exact', head: true })

    const assignmentRate = totalAssignments && totalAssignments > 0 && students
      ? Math.min(100, Math.round(((submittedAssignments ?? 0) / (totalAssignments * students.length)) * 100))
      : 0

    const { count: threadCount } = await supabase
      .from('discussion_threads')
      .select('*', { count: 'exact', head: true })

    const { count: replyCount } = await supabase
      .from('discussion_replies')
      .select('*', { count: 'exact', head: true })

    const discussionScore = Math.min(100, Math.round(((threadCount ?? 0) + (replyCount ?? 0)) / Math.max(1, students?.length ?? 1) * 10))

    const { count: projectSubs } = await supabase
      .from('project_submissions')
      .select('*', { count: 'exact', head: true })

    const { count: totalProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })

    const projectRate = totalProjects && totalProjects > 0 && students
      ? Math.min(100, Math.round(((projectSubs ?? 0) / (totalProjects * Math.max(1, students.length))) * 100))
      : 0

    setRadialData([
      { name: 'Attendance', value: avgAttendance, fill: '#6366f1' },
      { name: 'Assignments', value: assignmentRate, fill: '#10b981' },
      { name: 'Discussions', value: discussionScore, fill: '#f59e0b' },
      { name: 'Projects', value: projectRate, fill: '#ec4899' },
    ])

    // Weekly line data - last 4 weeks
    const weeks: { label: string; attendance: number; assignments: number; discussions: number }[] = []
    for (let w = 3; w >= 0; w--) {
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() - w * 7)
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() - 7)

      const startStr = weekStart.toISOString().split('T')[0]
      const endStr = weekEnd.toISOString().split('T')[0]

      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('id')
        .gte('session_date', startStr)
        .lte('session_date', endStr)

      let weekAttendance = 0
      if (weekSessions && weekSessions.length > 0) {
        const sessionIds = weekSessions.map(s => s.id)
        const { count: approved } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .in('session_id', sessionIds)
          .eq('status', 'approved')

        const { count: total } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .in('session_id', sessionIds)

        weekAttendance = total && total > 0 ? Math.round(((approved ?? 0) / total) * 100) : 0
      }

      const { count: weekThreads } = await supabase
        .from('discussion_threads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString())

      const { count: weekReplies } = await supabase
        .from('discussion_replies')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString())

      const { count: weekSubs } = await supabase
        .from('assignment_submissions')
        .select('*', { count: 'exact', head: true })
        .gte('submitted_at', weekStart.toISOString())
        .lte('submitted_at', weekEnd.toISOString())

      weeks.push({
        label: `Week ${4 - w}`,
        attendance: weekAttendance,
        assignments: Math.min(100, (weekSubs ?? 0) * 10),
        discussions: Math.min(100, ((weekThreads ?? 0) + (weekReplies ?? 0)) * 5),
      })
    }
    setLineData(weeks)

    // Radar data
    const { count: leaveApproved } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    const { count: totalLeaves } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })

    const timelinessScore = totalLeaves && totalLeaves > 0
      ? Math.round(100 - ((leaveApproved ?? 0) / totalLeaves) * 30)
      : 85

    const participationScore = Math.min(100, Math.round(
      (avgAttendance * 0.4 + assignmentRate * 0.3 + discussionScore * 0.3)
    ))

    setRadarData([
      { metric: 'Attendance', score: avgAttendance, fullMark: 100 },
      { metric: 'Assignments', score: assignmentRate, fullMark: 100 },
      { metric: 'Discussions', score: discussionScore, fullMark: 100 },
      { metric: 'Timeliness', score: timelinessScore, fullMark: 100 },
      { metric: 'Projects', score: projectRate, fullMark: 100 },
      { metric: 'Participation', score: participationScore, fullMark: 100 },
    ])

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <EngagementRadialChart data={radialData} title="Engagement Overview" />
      <EngagementLineChart data={lineData} title="Weekly Engagement Trends" />
      <EngagementRadarChart data={radarData} title="Student Engagement Profile" />
    </div>
  )
}
