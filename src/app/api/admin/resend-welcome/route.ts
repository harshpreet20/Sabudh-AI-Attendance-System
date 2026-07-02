import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/helpers'
import { resend, generatePassword, welcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const { auth_user_id, email, full_name, type } = await request.json()

    if (!auth_user_id || !email || !full_name || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const newPassword = generatePassword()

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(auth_user_id, {
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to reset password' },
        { status: 500 }
      )
    }

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://sabudh-ai-attendance-system.vercel.app/login'

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: true,
        email,
        password: newPassword,
        email_sent: false,
      })
    }

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
      to: email,
      subject: `Your Updated Credentials - ${COURSE_NAME}`,
      html: welcomeEmailHtml({
        studentName: full_name,
        email,
        password: newPassword,
        courseName: COURSE_NAME,
        location: LOCATION,
        loginUrl,
      }),
    })

    return NextResponse.json({
      success: true,
      email,
      password: newPassword,
      email_sent: true,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resend credentials' },
      { status: 500 }
    )
  }
}
