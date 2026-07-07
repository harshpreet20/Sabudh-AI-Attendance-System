import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notify'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

// Notify a student that their assignment submission has been graded.
// Called by the client after the submission row is updated with a score.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleRow || !STAFF_ROLES.includes(roleRow.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const submissionId: string | undefined = body?.submission_id
    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Missing submission_id' } },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: submission } = await service
      .from('assignment_submissions')
      .select('id, score, feedback, assignment_id, student_id')
      .eq('id', submissionId)
      .single()

    if (!submission) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Submission not found' } },
        { status: 404 }
      )
    }

    const [{ data: assignment }, { data: student }] = await Promise.all([
      service
        .from('assignments')
        .select('title, max_score')
        .eq('id', submission.assignment_id)
        .single(),
      service
        .from('student_profiles')
        .select('auth_user_id')
        .eq('id', submission.student_id)
        .single(),
    ])

    if (!student?.auth_user_id) {
      return NextResponse.json({ success: true, data: { sent: 0 } })
    }

    const assignmentTitle = assignment?.title ?? 'your assignment'
    const scoreText =
      submission.score != null
        ? ` Score: ${submission.score}/${assignment?.max_score ?? 100}.`
        : ''

    await sendNotification({
      userId: student.auth_user_id,
      type: 'info',
      title: 'Assignment graded',
      message: `Your submission for "${assignmentTitle}" has been graded.${scoreText}`,
      url: '/dashboard/assignments',
    })

    return NextResponse.json({ success: true, data: { sent: 1 } })
  } catch (error) {
    console.error('Grade notify error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
