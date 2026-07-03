import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ counts: {} }, { status: 401 })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roleSet = new Set(roles?.map(r => r.role) ?? [])
    const isAdmin = roleSet.has('admin') || roleSet.has('super_admin')
    const isTeacher = roleSet.has('instructor')

    const counts: Record<string, number> = {}

    const { count: notifCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
    counts.notifications = notifCount ?? 0

    const { data: channels } = await supabase
      .from('direct_message_channels')
      .select('id, participant_1, participant_2')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)

    if (channels && channels.length > 0) {
      let msgTotal = 0
      for (const ch of channels) {
        const { count } = await supabase
          .from('direct_messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', ch.id)
          .neq('sender_id', user.id)
          .is('read_at', null)
        msgTotal += count ?? 0
      }
      counts.messages = msgTotal
    }

    const { count: threadCount } = await supabase
      .from('discussion_threads')
      .select('*', { count: 'exact', head: true })
      .eq('is_resolved', false)
    counts.discussions = threadCount ?? 0

    if (isAdmin) {
      const { count: pendingApprovals } = await supabase
        .from('student_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      counts.approvals = pendingApprovals ?? 0

      const { count: pendingLeave } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      counts.leave = pendingLeave ?? 0

      const { count: announcementCount } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      counts.announcements = announcementCount ?? 0
    } else if (isTeacher) {
      const { data: teacherProfile } = await supabase
        .from('teacher_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { count: pendingLeave } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      counts.leave = pendingLeave ?? 0

      if (teacherProfile) {
        const { count: ungradedAssignments } = await supabase
          .from('assignment_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'submitted')
        counts.assignments = ungradedAssignments ?? 0

        const { count: ungradedProjects } = await supabase
          .from('project_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'submitted')
        counts.projects = ungradedProjects ?? 0
      }
    } else {
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('id, batch_id')
        .eq('auth_user_id', user.id)
        .single()

      if (studentProfile) {
        const { count: pendingLeave } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', studentProfile.id)
          .eq('status', 'pending')
        counts.leave = pendingLeave ?? 0

        if (studentProfile.batch_id) {
          const { count: activeAssignments } = await supabase
            .from('assignments')
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', studentProfile.batch_id)
            .eq('status', 'active')
            .gte('due_date', new Date().toISOString().split('T')[0])
          counts.assignments = activeAssignments ?? 0

          const { count: announcementCount } = await supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true })
            .or(`batch_id.eq.${studentProfile.batch_id},batch_id.is.null`)
            .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          counts.announcements = announcementCount ?? 0
        }
      }
    }

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Badge counts error:', error)
    return NextResponse.json({ counts: {} }, { status: 500 })
  }
}
