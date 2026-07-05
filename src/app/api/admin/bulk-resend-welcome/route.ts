import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/helpers'
import { resend, FROM_EMAIL, generatePassword, welcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const { emails } = await request.json()

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'Provide an array of email addresses' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 })
    }

    const fromEmail = FROM_EMAIL
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const results: Array<{ email: string; name: string; status: 'sent' | 'error'; error?: string }> = []

    for (const email of emails) {
      try {
        const { data: profile } = await adminSupabase
          .from('student_profiles')
          .select('full_name, auth_user_id')
          .eq('email', email.toLowerCase())
          .maybeSingle()

        if (!profile || !profile.auth_user_id) {
          results.push({ email, name: '', status: 'error', error: 'Student profile not found' })
          continue
        }

        const newPassword = generatePassword()

        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(profile.auth_user_id, {
          password: newPassword,
        })

        if (updateError) {
          results.push({ email, name: profile.full_name, status: 'error', error: updateError.message })
          continue
        }

        const emailResult = await resend.emails.send({
          from: fromEmail,
          to: email.toLowerCase(),
          subject: `Welcome to ${COURSE_NAME} - Your Credentials Inside`,
          html: welcomeEmailHtml({
            studentName: profile.full_name,
            email: email.toLowerCase(),
            password: newPassword,
            courseName: COURSE_NAME,
            location: LOCATION,
            loginUrl,
          }),
        })

        if (emailResult.error) {
          console.error(`[bulk-resend] Resend API error for ${email}:`, emailResult.error.message)
          results.push({ email, name: profile.full_name, status: 'error', error: emailResult.error.message })
        } else {
          results.push({ email, name: profile.full_name, status: 'sent' })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[bulk-resend] Exception for ${email}:`, errMsg)
        results.push({ email, name: '', status: 'error', error: errMsg })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
    const failed = results.filter(r => r.status === 'error').length
    console.log(`[bulk-resend] Complete: ${sent} sent, ${failed} failed out of ${emails.length}`)

    return NextResponse.json({
      message: `${sent} emails sent, ${failed} failed`,
      sent,
      failed,
      total: emails.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk resend failed' },
      { status: 500 }
    )
  }
}
