import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getResend, passwordChangedEmailHtml } from '@/lib/resend'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const result = await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
          to: user.email,
          subject: 'Password changed - Sabudh AI Attendance System',
          html: passwordChangedEmailHtml(),
        })
        if (result.error) {
          console.error('[password-changed] Resend API error:', result.error.message)
        }
      } catch (err) {
        console.error('[password-changed] Email send exception:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
