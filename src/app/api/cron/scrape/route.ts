import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results: Array<{ source: string; status: string }> = []

  try {
    const { count: studentCount } = await supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    const { count: teacherCount } = await supabase
      .from('teacher_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    const { data: batchData } = await supabase
      .from('batches')
      .select('id, name, status, start_date, end_date, course_id, courses(title, attendance_requirement)')
      .order('created_at', { ascending: false })
      .limit(20)

    const activeBatches = batchData?.filter(b => b.status === 'active') ?? []

    const { data: scheduleData } = await supabase
      .from('class_schedules')
      .select('title, scheduled_date, start_time, end_time, status, batch_id')
      .eq('organization_id', ORG_ID)
      .gte('scheduled_date', new Date().toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true })
      .limit(15)

    const { data: announcementData } = await supabase
      .from('announcements')
      .select('title, content, priority, published_at')
      .eq('organization_id', ORG_ID)
      .order('published_at', { ascending: false })
      .limit(10)

    const { data: recentSessions } = await supabase
      .from('sessions')
      .select('id, session_date, status, topic_taught, next_topic, batches(name)')
      .order('session_date', { ascending: false })
      .limit(10)

    const { data: courseData } = await supabase
      .from('courses')
      .select('id, title, description, duration_weeks, attendance_requirement, status')
      .eq('organization_id', ORG_ID)
      .order('title')

    const platformSummary = [
      `Sabudh AI Platform Summary (updated ${new Date().toISOString()})`,
      ``,
      `Total active students: ${studentCount ?? 0}`,
      `Total active teachers: ${teacherCount ?? 0}`,
      ``,
      `Courses:`,
      ...(courseData?.map(c => `- ${c.title}: ${c.description || 'No description'} (${c.duration_weeks ?? '?'} weeks, ${c.attendance_requirement}% attendance required, ${c.status})`) ?? ['  None']),
      ``,
      `Active Batches:`,
      ...(activeBatches.map(b => {
        const course = (b as Record<string, unknown>).courses as { title: string; attendance_requirement: number } | null
        return `- ${b.name}: Course "${course?.title ?? 'N/A'}", ${b.start_date ?? '?'} to ${b.end_date ?? '?'}`
      })),
      ``,
      scheduleData?.length ? `Upcoming Schedules:\n${scheduleData.map(s => `- ${s.title} on ${s.scheduled_date} (${s.start_time}-${s.end_time})`).join('\n')}` : 'No upcoming schedules',
      ``,
      announcementData?.length ? `Recent Announcements:\n${announcementData.map(a => `- [${a.priority}] ${a.title}: ${(a.content || '').slice(0, 200)}`).join('\n')}` : 'No recent announcements',
      ``,
      recentSessions?.length ? `Recent Sessions:\n${recentSessions.map(s => {
        const batch = (s as Record<string, unknown>).batches as { name: string } | null
        return `- ${batch?.name ?? 'Unknown batch'} on ${s.session_date} (${s.status})${s.topic_taught ? ` — Topic: ${s.topic_taught}` : ''}${s.next_topic ? ` — Next: ${s.next_topic}` : ''}`
      }).join('\n')}` : 'No recent sessions',
    ].join('\n')

    const { data: existing } = await supabase
      .from('chatbot_knowledge')
      .select('id')
      .eq('source', 'scrape')
      .eq('source_url', '/platform-summary')
      .eq('organization_id', ORG_ID)
      .single()

    const doc = {
      organization_id: ORG_ID,
      title: 'Platform Activity Summary',
      content: platformSummary,
      source: 'scrape' as const,
      source_url: '/platform-summary',
      category: 'activity',
    }

    if (existing) {
      await supabase.from('chatbot_knowledge').update({ ...doc, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('chatbot_knowledge').insert(doc)
    }

    results.push({ source: 'platform-summary', status: 'ok' })

    const aboutContent = [
      `About Sabudh AI`,
      `Sabudh AI is an educational technology platform for AI/ML training.`,
      `Features: Attendance tracking with face/voice verification, course management, batch-based learning,`,
      `assignments and project submissions with AI assessment, discussion forums, 1-on-1 messaging,`,
      `certificate management, student journey tracking, and admin analytics.`,
      ``,
      `Students can: Mark attendance with biometric verification, view course materials, submit assignments/projects,`,
      `participate in discussions, track their learning progress, and download certificates.`,
      ``,
      `Teachers can: Create sessions, manage curriculum, grade submissions, track student progress,`,
      `set topic completion percentages, and manage attendance.`,
      ``,
      `Admins can: Manage users (students/teachers), courses, batches, classrooms, view audit logs,`,
      `configure system settings, manage announcements, and view analytics dashboards.`,
    ].join('\n')

    const { data: aboutExisting } = await supabase
      .from('chatbot_knowledge')
      .select('id')
      .eq('source', 'scrape')
      .eq('source_url', '/about-platform')
      .eq('organization_id', ORG_ID)
      .single()

    const aboutDoc = {
      organization_id: ORG_ID,
      title: 'About Sabudh AI Platform',
      content: aboutContent,
      source: 'scrape' as const,
      source_url: '/about-platform',
      category: 'platform',
    }

    if (aboutExisting) {
      await supabase.from('chatbot_knowledge').update({ ...aboutDoc, updated_at: new Date().toISOString() }).eq('id', aboutExisting.id)
    } else {
      await supabase.from('chatbot_knowledge').insert(aboutDoc)
    }

    results.push({ source: 'about-platform', status: 'ok' })
  } catch (err) {
    results.push({ source: 'data-scrape', status: `error: ${err instanceof Error ? err.message : 'unknown'}` })
  }

  return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() })
}
