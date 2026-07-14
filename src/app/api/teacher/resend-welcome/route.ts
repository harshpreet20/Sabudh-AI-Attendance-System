import { NextRequest, NextResponse } from 'next/server'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resend, FROM_EMAIL, generatePassword, welcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

// Instructor-facing bulk resend of welcome/login credentials, scoped to the
// students in the caller's own batches. Any email that does not belong to one
// of the instructor's batch students is rejected — a teacher can never trigger
// a password reset + email for a student outside their batches.
export async function POST(request: NextRequest) {
  try {
    const userClient = await createUserClient()
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const { data: role } = await userClient.from('user_roles').select('role').eq('user_id', user.id).single()
    if (!role || !['instructor', 'admin', 'super_admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Instructors only' }, { status: 403 })
    }

    const { emails } = await request.json()
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'Provide an array of email addresses' }, { status: 400 })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve the instructor's batches and the students within them.
    const { data: batches } = await admin.from('batches').select('id').eq('instructor_id', user.id)
    const batchIds = new Set((batches || []).map((b) => b.id))

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 })
    }

    const results: Array<{ email: string; name: string; status: 'sent' | 'error' | 'skipped'; error?: string }> = []

    for (const rawEmail of emails) {
      const email = String(rawEmail).toLowerCase()
      try {
        const { data: profile } = await admin
          .from('student_profiles')
          .select('full_name, auth_user_id, batch_id')
          .eq('email', email)
          .maybeSingle()

        if (!profile || !profile.auth_user_id) {
          results.push({ email, name: '', status: 'error', error: 'Student not found' })
          continue
        }
        // Scope guard: only students in the instructor's own batches.
        if (!profile.batch_id || !batchIds.has(profile.batch_id)) {
          results.push({ email, name: profile.full_name, status: 'skipped', error: 'Not in your batch' })
          continue
        }

        // Send the credential email FIRST — only persist the new password if the
        // email actually went out, so a delivery failure can't silently lock the
        // account to a password nobody received.
        const newPassword = generatePassword()
        const emailResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `Welcome to ${COURSE_NAME} - Your Credentials Inside`,
          html: welcomeEmailHtml({
            studentName: profile.full_name,
            email,
            password: newPassword,
            courseName: COURSE_NAME,
            location: LOCATION,
            loginUrl,
          }),
        })
        if (emailResult.error) {
          results.push({ email, name: profile.full_name, status: 'error', error: emailResult.error.message })
          continue
        }

        const { error: pwErr } = await admin.auth.admin.updateUserById(profile.auth_user_id, { password: newPassword })
        results.push(pwErr
          ? { email, name: profile.full_name, status: 'error', error: pwErr.message }
          : { email, name: profile.full_name, status: 'sent' })
      } catch (err) {
        results.push({ email, name: '', status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const failed = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `${sent} emails sent${skipped ? `, ${skipped} skipped (not in your batch)` : ''}${failed ? `, ${failed} failed` : ''}`,
      sent,
      skipped,
      failed,
      total: emails.length,
      results,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Resend failed' }, { status: 500 })
  }
}
