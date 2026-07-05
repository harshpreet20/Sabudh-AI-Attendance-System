import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResend, FROM_EMAIL, passwordResetEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://attendanceai.harshpreetbhasin.com'

    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.toLowerCase(),
      options: {
        redirectTo: `${appUrl}/auth/confirm`,
      },
    })

    if (error) {
      // Don't reveal whether the email exists or not
      return NextResponse.json({ success: true })
    }

    const resetUrl = `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`

    if (process.env.RESEND_API_KEY) {
      try {
        const result = await getResend().emails.send({
          from: FROM_EMAIL,
          to: email.toLowerCase(),
          subject: 'Reset your password - Sabudh AI Attendance System',
          html: passwordResetEmailHtml({ resetUrl }),
        })
        if (result.error) {
          console.error('[forgot-password] Resend API error:', result.error.message)
        }
      } catch (err) {
        console.error('[forgot-password] Email send exception:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
