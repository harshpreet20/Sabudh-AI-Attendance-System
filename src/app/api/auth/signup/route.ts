import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResend, signupConfirmationEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, full_name, phone, signup_role, ...extraMeta } = body

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://attendanceai.harshpreetbhasin.com'

    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type: 'signup',
      email: email.toLowerCase(),
      password,
      options: {
        data: {
          full_name,
          phone: phone || null,
          signup_role: signup_role || 'student',
          ...extraMeta,
        },
        redirectTo: `${appUrl}/auth/confirm`,
      },
    })

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        return NextResponse.json({ error: 'An account with this email already exists. Please sign in instead.' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=email`

    if (process.env.RESEND_API_KEY) {
      try {
        const result = await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
          to: email.toLowerCase(),
          subject: 'Confirm your email - Sabudh AI Attendance System',
          html: signupConfirmationEmailHtml({ confirmUrl }),
        })
        if (result.error) {
          console.error('[signup] Resend API error:', result.error.message)
        }
      } catch (err) {
        console.error('[signup] Email send exception:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Signup failed' },
      { status: 500 }
    )
  }
}
