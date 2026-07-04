import { getResend, registrationPendingEmailHtml, newSignupAdminEmailHtml } from '@/lib/resend'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>'
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

  await Promise.allSettled([
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
}
