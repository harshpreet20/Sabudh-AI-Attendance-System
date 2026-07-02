import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const INACTIVE_DAYS = 45

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS)
  const cutoffISO = cutoffDate.toISOString()

  // Find all active student profiles where last_active_at is older than 45 days
  const { data: inactiveStudents, error: fetchError } = await supabase
    .from('student_profiles')
    .select('id, auth_user_id, organization_id, batch_id, full_name, email, created_at, attendance_percentage')
    .eq('organization_id', ORG_ID)
    .eq('status', 'active')
    .lt('last_active_at', cutoffISO)

  if (fetchError) {
    console.error('Failed to fetch inactive students:', fetchError)
    return NextResponse.json(
      { error: 'Failed to fetch inactive students', details: fetchError.message },
      { status: 500 },
    )
  }

  if (!inactiveStudents || inactiveStudents.length === 0) {
    return NextResponse.json({
      success: true,
      archived_count: 0,
      message: 'No inactive students found',
      timestamp: new Date().toISOString(),
    })
  }

  const results: Array<{
    student_id: string
    full_name: string
    status: 'archived' | 'error'
    error?: string
  }> = []

  for (const student of inactiveStudents) {
    try {
      // ---- Calculate scores ----

      // Average assignment score
      const { data: assignmentScores } = await supabase
        .from('assignment_submissions')
        .select('score')
        .eq('student_id', student.id)
        .not('score', 'is', null)

      const avgAssignmentScore =
        assignmentScores && assignmentScores.length > 0
          ? assignmentScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / assignmentScores.length
          : null

      // Average project score
      const { data: projectScores } = await supabase
        .from('project_submissions')
        .select('score')
        .eq('student_id', student.id)
        .not('score', 'is', null)

      const avgProjectScore =
        projectScores && projectScores.length > 0
          ? projectScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / projectScores.length
          : null

      // Attendance percentage (already stored on the profile, but recalculate from source)
      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('decision')
        .eq('student_id', student.id)

      let totalAttendancePct: number | null = null
      if (attendanceRecords && attendanceRecords.length > 0) {
        const accepted = attendanceRecords.filter((a) => a.decision === 'accepted').length
        totalAttendancePct = parseFloat(((accepted / attendanceRecords.length) * 100).toFixed(2))
      }

      // Get batch name via join
      let batchName: string | null = null
      if (student.batch_id) {
        const { data: batch } = await supabase
          .from('batches')
          .select('name')
          .eq('id', student.batch_id)
          .single()
        batchName = batch?.name ?? null
      }

      // ---- Insert into archived_students ----
      const { error: archiveInsertError } = await supabase
        .from('archived_students')
        .insert({
          original_id: student.id,
          organization_id: student.organization_id,
          full_name: student.full_name,
          email: student.email,
          batch_name: batchName,
          enrollment_date: student.created_at,
          total_attendance_pct: totalAttendancePct,
          avg_assignment_score: avgAssignmentScore !== null ? parseFloat(avgAssignmentScore.toFixed(2)) : null,
          avg_project_score: avgProjectScore !== null ? parseFloat(avgProjectScore.toFixed(2)) : null,
          archive_reason: 'inactive_45_days',
        })

      if (archiveInsertError) {
        throw new Error(`Failed to insert archive record: ${archiveInsertError.message}`)
      }

      // ---- Delete related data in FK-safe order ----

      const authUserId = student.auth_user_id

      // 1. Discussion thread replies by the student
      const { error: repliesErr } = await supabase
        .from('discussion_replies')
        .delete()
        .eq('author_id', authUserId)
      if (repliesErr) console.error(`[${student.id}] Failed to delete discussion_replies:`, repliesErr.message)

      // 2. Discussion upvotes by the student
      const { error: upvotesErr } = await supabase
        .from('discussion_upvotes')
        .delete()
        .eq('user_id', authUserId)
      if (upvotesErr) console.error(`[${student.id}] Failed to delete discussion_upvotes:`, upvotesErr.message)

      // 3. Discussion threads by the student
      const { error: threadsErr } = await supabase
        .from('discussion_threads')
        .delete()
        .eq('author_id', authUserId)
      if (threadsErr) console.error(`[${student.id}] Failed to delete discussion_threads:`, threadsErr.message)

      // 4. Messages sent by the student
      const { error: messagesErr } = await supabase
        .from('messages')
        .delete()
        .eq('sender_id', authUserId)
      if (messagesErr) console.error(`[${student.id}] Failed to delete messages:`, messagesErr.message)

      // 5. Null out file_urls and content on assignment submissions (keep rows for score data)
      const { error: aSubErr } = await supabase
        .from('assignment_submissions')
        .update({ file_urls: [], content: null })
        .eq('student_id', student.id)
      if (aSubErr) console.error(`[${student.id}] Failed to clear assignment_submissions:`, aSubErr.message)

      // 6. Null out file_urls and content on project submissions (keep rows for score data)
      const { error: pSubErr } = await supabase
        .from('project_submissions')
        .update({ file_urls: [], content: null })
        .eq('student_id', student.id)
      if (pSubErr) console.error(`[${student.id}] Failed to clear project_submissions:`, pSubErr.message)

      // 7. Notification records
      const { error: notifsErr } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', authUserId)
      if (notifsErr) console.error(`[${student.id}] Failed to delete notifications:`, notifsErr.message)

      // 8. Leave requests (leave_requests table)
      const { error: leaveErr } = await supabase
        .from('leave_requests')
        .delete()
        .eq('student_id', student.id)
      if (leaveErr) console.error(`[${student.id}] Failed to delete leave_requests:`, leaveErr.message)

      // ---- Update student profile to archived ----
      const { error: profileUpdateErr } = await supabase
        .from('student_profiles')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archive_reason: 'inactive_45_days',
        })
        .eq('id', student.id)

      if (profileUpdateErr) {
        throw new Error(`Failed to update profile to archived: ${profileUpdateErr.message}`)
      }

      results.push({
        student_id: student.id,
        full_name: student.full_name,
        status: 'archived',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      console.error(`Failed to archive student ${student.id} (${student.full_name}):`, message)
      results.push({
        student_id: student.id,
        full_name: student.full_name,
        status: 'error',
        error: message,
      })
    }
  }

  const archivedCount = results.filter((r) => r.status === 'archived').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    success: errorCount === 0,
    archived_count: archivedCount,
    error_count: errorCount,
    results,
    timestamp: new Date().toISOString(),
  })
}
