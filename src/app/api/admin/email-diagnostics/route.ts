import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getResend, FROM_EMAIL, welcomeEmailHtml } from '@/lib/resend'

// Admin-only diagnostics for email delivery.
//   GET  -> reports the configured sender and lists domains verified on the Resend account.
//   POST -> sends a real test email and returns the exact Resend error (if any).
// Use this to confirm the FROM domain (attendanceai.harshpreetbhasin.com) is verified.

async function requireAdminJson() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated', status: 401 as const }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isAdmin = roles?.some((r) => ['admin', 'super_admin'].includes(r.role))
  if (!isAdmin) return { error: 'Forbidden', status: 403 as const }

  return { user }
}

export async function GET() {
  const auth = await requireAdminJson()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const hasApiKey = !!process.env.RESEND_API_KEY
  const usingEnvOverride = !!process.env.RESEND_FROM_EMAIL

  let domains: unknown = null
  let domainsError: string | null = null

  if (hasApiKey) {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
      const json = await res.json()
      if (!res.ok) {
        domainsError = json?.message || `Resend API returned ${res.status}`
      } else {
        // Only surface non-sensitive fields.
        const list = Array.isArray(json?.data) ? json.data : []
        domains = list.map((d: { name?: string; status?: string; region?: string }) => ({
          name: d.name,
          status: d.status,
          region: d.region,
        }))
      }
    } catch (err) {
      domainsError = err instanceof Error ? err.message : 'Failed to reach Resend'
    }
  }

  return NextResponse.json({
    fromEmail: FROM_EMAIL,
    fromDomainVerifiedHint:
      'The domain part of fromEmail must appear below with status "verified".',
    hasApiKey,
    usingEnvOverride,
    domains,
    domainsError,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminJson()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 })
  }

  const { to } = await request.json().catch(() => ({ to: null }))
  const recipient = typeof to === 'string' && to.includes('@') ? to : auth.user!.email

  if (!recipient) {
    return NextResponse.json({ error: 'No recipient email available' }, { status: 400 })
  }

  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject: 'Sabudh AI — Email Delivery Test',
      html: welcomeEmailHtml({
        studentName: 'Test User',
        email: recipient,
        password: 'TEST-EMAIL-ONLY',
        courseName: 'GEN AI Zero to One',
        location: 'GK Duggal Memorial Centre, Rajouri Garden, New Delhi',
        loginUrl: 'https://attendanceai.harshpreetbhasin.com/login',
      }),
    })

    if (result.error) {
      return NextResponse.json({
        sent: false,
        from: FROM_EMAIL,
        to: recipient,
        error: result.error.message,
      })
    }

    return NextResponse.json({
      sent: true,
      from: FROM_EMAIL,
      to: recipient,
      id: result.data?.id,
    })
  } catch (err) {
    return NextResponse.json({
      sent: false,
      from: FROM_EMAIL,
      to: recipient,
      error: err instanceof Error ? err.message : 'Send failed',
    })
  }
}
