import { getResend, FROM_EMAIL, registrationPendingEmailHtml, newSignupAdminEmailHtml } from '@/lib/resend'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'harshpreet@hotbotstudios.com'

export async function sendSignupNotificationEmails(params: {
  userName: string
  userEmail: string
  role: 'student' | 'teacher'
  origin: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const loginUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
    : `${params.origin}/login`
  const approvalsUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/approvals`
    : `${params.origin}/admin/approvals`

  const roleLabel = params.role === 'teacher' ? 'Instructor' : 'Student'

  const results = await Promise.allSettled([
    resend.emails.send({
      from: FROM_EMAIL,
      to: params.userEmail,
      subject: `Registration Received - Sabudh AI (${roleLabel})`,
      html: registrationPendingEmailHtml({
        userName: params.userName,
        role: params.role,
        loginUrl,
      }),
    }),
    resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `New ${roleLabel} Signup: ${params.userName}`,
      html: newSignupAdminEmailHtml({
        userName: params.userName,
        userEmail: params.userEmail,
        role: params.role,
        approvalsUrl,
      }),
    }),
  ])

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[signup-email] Send failed:', r.reason)
    } else if (r.value?.error) {
      console.error('[signup-email] Resend API error:', r.value.error.message)
    }
  }
}
