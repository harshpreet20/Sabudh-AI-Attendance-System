import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getResend, leaveStatusEmailHtml, attendanceAlertEmailHtml, weeklyDigestEmailHtml, announcementEmailHtml, approvalNotificationEmailHtml } from '@/lib/resend'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isStaff = roles?.some(r => ['instructor', 'admin', 'super_admin'].includes(r.role))
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { type } = body

  try {
    const resend = getResend()

    if (type === 'leave_status') {
      const { studentEmail, studentName, leaveDate, status, reviewerNote } = body
      await resend.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject: `Leave Request ${status === 'approved' ? 'Approved' : 'Rejected'} - ${leaveDate}`,
        html: leaveStatusEmailHtml({ studentName, leaveDate, status, reviewerNote }),
      })
      return NextResponse.json({ success: true })
    }

    if (type === 'attendance_alert') {
      const { studentEmail, studentName, attendancePercentage, threshold } = body
      await resend.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject: `Low Attendance Alert - ${attendancePercentage}%`,
        html: attendanceAlertEmailHtml({ studentName, attendancePercentage, threshold }),
      })
      return NextResponse.json({ success: true })
    }

    if (type === 'weekly_digest') {
      const { studentEmail, studentName, weeklyPercentage, overallPercentage, sessionsAttended, totalSessions, weekStart, weekEnd } = body
      await resend.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject: `Weekly Attendance Report - ${weekStart} to ${weekEnd}`,
        html: weeklyDigestEmailHtml({ studentName, weeklyPercentage, overallPercentage, sessionsAttended, totalSessions, weekStart, weekEnd }),
      })
      return NextResponse.json({ success: true })
    }

    if (type === 'announcement') {
      const { studentEmail, studentName, title, content, priority } = body
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/announcements`
        : 'https://attendanceai.harshpreetbhasin.com/dashboard/announcements'
      await resend.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject: `${priority === 'urgent' ? '[URGENT] ' : ''}${title}`,
        html: announcementEmailHtml({ studentName, title, content, priority, dashboardUrl }),
      })
      return NextResponse.json({ success: true })
    }

    if (type === 'approval_notification') {
      const { studentEmail, studentName, status, batchName } = body
      const loginUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
        : 'https://attendanceai.harshpreetbhasin.com/login'
      await resend.emails.send({
        from: FROM_EMAIL,
        to: studentEmail,
        subject: status === 'approved'
          ? 'Your Sabudh AI Account Has Been Approved!'
          : 'Sabudh AI Account Registration Update',
        html: approvalNotificationEmailHtml({ studentName, status, loginUrl, batchName }),
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown email type' }, { status: 400 })
  } catch (error) {
    console.error('Email send error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
