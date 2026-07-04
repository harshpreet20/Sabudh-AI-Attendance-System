import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/helpers'
import { resend, generatePassword, welcomeEmailHtml, teacherWelcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const body = await request.json()
    const { type, full_name, email, phone, batch_id, subject_expertise, qualification, city, profession } = body

    if (!type || !full_name || !email) {
      return NextResponse.json({ error: 'Type, name, and email are required' }, { status: 400 })
    }

    if (!['student', 'teacher'].includes(type)) {
      return NextResponse.json({ error: 'Type must be student or teacher' }, { status: 400 })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: existingProfile } = await adminSupabase
      .from(type === 'teacher' ? 'teacher_profiles' : 'student_profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingProfile) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
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
        { error: authError?.message || 'Failed to create auth account' },
        { status: 500 }
      )
    }

    const role = type === 'teacher' ? 'instructor' : 'student'
    await adminSupabase.from('user_roles').insert({
      user_id: authData.user.id,
      role,
      organization_id: ORG_ID,
    })

    if (type === 'teacher') {
      await adminSupabase.from('teacher_profiles').insert({
        auth_user_id: authData.user.id,
        organization_id: ORG_ID,
        full_name,
        email: email.toLowerCase(),
        phone: phone || null,
        subject_expertise: subject_expertise || null,
        qualification: qualification || null,
        status: 'active',
      })
    } else {
      await adminSupabase.from('student_profiles').insert({
        auth_user_id: authData.user.id,
        organization_id: ORG_ID,
        batch_id: batch_id || null,
        full_name,
        email: email.toLowerCase(),
        phone: phone || null,
        qualification: qualification || null,
        city: city || null,
        profession: profession || null,
        status: 'active',
      })
    }

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    let emailSent = false
    let emailError: string | undefined

    if (process.env.RESEND_API_KEY) {
      try {
        const emailResult = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
          to: email.toLowerCase(),
          subject: type === 'teacher'
            ? `Instructor Access - ${COURSE_NAME}`
            : `Welcome to ${COURSE_NAME} - Your Credentials Inside`,
          html: type === 'teacher'
            ? teacherWelcomeEmailHtml({
                teacherName: full_name,
                email: email.toLowerCase(),
                password,
                courseName: COURSE_NAME,
                location: LOCATION,
                loginUrl,
              })
            : welcomeEmailHtml({
                studentName: full_name,
                email: email.toLowerCase(),
                password,
                courseName: COURSE_NAME,
                location: LOCATION,
                loginUrl,
              }),
        })
        emailSent = !emailResult.error
        if (emailResult.error) {
          emailError = emailResult.error.message
          console.error(`[add-user] Resend API error for ${email}:`, emailResult.error.message)
        }
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Email send failed'
        console.error(`[add-user] Email exception for ${email}:`, emailError)
      }
    } else {
      emailError = 'RESEND_API_KEY is not configured'
    }

    return NextResponse.json({
      success: true,
      email: email.toLowerCase(),
      password,
      type,
      email_sent: emailSent,
      email_error: emailError,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add user' },
      { status: 500 }
    )
  }
}
