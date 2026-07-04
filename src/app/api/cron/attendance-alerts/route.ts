import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getResend, attendanceAlertEmailHtml } from '@/lib/resend'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const hasResend = !!process.env.RESEND_API_KEY
  let alertsSent = 0
  let errors = 0

  const { data: activeBatches } = await supabase
    .from('batches')
    .select('id, name, total_planned_sessions, attendance_threshold_pct, course_id, courses(title, attendance_requirement)')
    .eq('status', 'active')

  if (!activeBatches || activeBatches.length === 0) {
    return NextResponse.json({ success: true, alertsSent: 0, message: 'No active batches' })
  }

  for (const batch of activeBatches) {
    const courseArr = batch.courses as unknown as { title: string; attendance_requirement: number }[] | null
    const course = Array.isArray(courseArr) ? courseArr[0] : courseArr
    const thresholdPct = batch.attendance_threshold_pct ?? course?.attendance_requirement ?? 75

    const { data: batchSessions } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('batch_id', batch.id)

    const totalSessions = batch.total_planned_sessions || (batchSessions?.length ?? 0)
    if (totalSessions === 0) continue

    const completedSessions = batchSessions?.filter(s =>
      ['completed', 'attendance_closed'].includes(s.status)
    ).length ?? 0
    const remainingSessions = Math.max(0, totalSessions - completedSessions)

    const { data: students } = await supabase
      .from('student_profiles')
      .select('id, auth_user_id, full_name, email, attendance_percentage, present_count')
      .eq('batch_id', batch.id)
      .eq('status', 'active')

    if (!students || students.length === 0) continue

    for (const student of students) {
      const currentPct = student.attendance_percentage ?? 0
      const presentCount = student.present_count ?? 0
      const neededPresent = Math.ceil((thresholdPct / 100) * totalSessions)
      const classesNeeded = Math.max(0, neededPresent - presentCount)
      const canMakeIt = classesNeeded <= remainingSessions

      if (currentPct >= thresholdPct) continue

      const { data: recentAlert } = await supabase
        .from('attendance_alerts')
        .select('id')
        .eq('student_id', student.id)
        .eq('batch_id', batch.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)

      if (recentAlert && recentAlert.length > 0) continue

      let alertType: string
      let message: string

      if (!canMakeIt) {
        alertType = 'critical'
        message = `Your attendance is ${currentPct.toFixed(1)}% — below the ${thresholdPct}% threshold. Even attending all ${remainingSessions} remaining classes won't be enough for certificate eligibility. Please contact your instructor.`
      } else if (classesNeeded >= remainingSessions * 0.8) {
        alertType = 'urgent'
        message = `Urgent: Your attendance is ${currentPct.toFixed(1)}%. You must attend ${classesNeeded} of the ${remainingSessions} remaining classes to reach ${thresholdPct}% for certificate eligibility.`
      } else {
        alertType = 'warning'
        message = `Your attendance is ${currentPct.toFixed(1)}% — below the ${thresholdPct}% requirement. You need to attend at least ${classesNeeded} more classes (${remainingSessions} remaining) to be eligible for the certificate.`
      }

      const { error: alertErr } = await supabase.from('attendance_alerts').insert({
        student_id: student.id,
        batch_id: batch.id,
        alert_type: alertType,
        current_attendance_pct: currentPct,
        required_attendance_pct: thresholdPct,
        classes_remaining: remainingSessions,
        classes_needed: classesNeeded,
        message,
        email_sent: false,
      })

      if (alertErr) {
        errors++
        continue
      }

      if (student.email && hasResend) {
        try {
          await getResend().emails.send({
            from: FROM_EMAIL,
            to: student.email,
            subject: `${alertType === 'critical' ? 'CRITICAL' : alertType === 'urgent' ? 'URGENT' : ''} Attendance Alert — ${batch.name}`,
            html: attendanceAlertEmailHtml({
              studentName: student.full_name || 'Student',
              attendancePercentage: currentPct,
              threshold: thresholdPct,
            }),
          })

          await supabase
            .from('attendance_alerts')
            .update({ email_sent: true })
            .eq('student_id', student.id)
            .eq('batch_id', batch.id)
            .order('created_at', { ascending: false })
            .limit(1)

          alertsSent++
        } catch (err) {
          console.error(`[attendance-alerts] Email failed for ${student.email}:`, err instanceof Error ? err.message : err)
          errors++
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    alertsSent,
    errors,
    timestamp: new Date().toISOString(),
  })
}
