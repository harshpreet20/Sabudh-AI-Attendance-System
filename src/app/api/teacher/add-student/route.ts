import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireInstructor } from '@/lib/auth/helpers'
import { resend, FROM_EMAIL, generatePassword, welcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

export async function POST(request: NextRequest) {
  try {
    await requireInstructor()

    const { full_name, email, phone } = await request.json()

    if (!full_name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: existing } = await adminSupabase
      .from('student_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'A student with this email already exists' }, { status: 409 })
    }

    const password = generatePassword()

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create account' },
        { status: 500 }
      )
    }

    await adminSupabase.from('user_roles').insert({
      user_id: authData.user.id,
      role: 'student',
      organization_id: ORG_ID,
    })

    await adminSupabase.from('student_profiles').insert({
      auth_user_id: authData.user.id,
      organization_id: ORG_ID,
      full_name,
      email: email.toLowerCase(),
      phone: phone || null,
      status: 'pending',
    })

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    let emailSent = false
    let emailError: string | undefined

    if (process.env.RESEND_API_KEY) {
      try {
        const emailResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: email.toLowerCase(),
          subject: `Welcome to ${COURSE_NAME} - Your Credentials Inside`,
          html: welcomeEmailHtml({
            studentName: full_name,
            email: email.toLowerCase(),
            password,
            courseName: COURSE_NAME,
            location: LOCATION,
            loginUrl,
          }),
        })
        emailSent = !emailResult.error
        if (emailResult.error) emailError = emailResult.error.message
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Email send failed'
      }
    } else {
      emailError = 'RESEND_API_KEY is not configured'
    }

    return NextResponse.json({
      success: true,
      email: email.toLowerCase(),
      password,
      email_sent: emailSent,
      email_error: emailError,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add student' },
      { status: 500 }
    )
  }
}
