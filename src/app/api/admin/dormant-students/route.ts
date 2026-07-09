import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/notifications'
import { resend, FROM_EMAIL } from '@/lib/resend'

const DORMANT_MS = 48 * 60 * 60 * 1000 // 48 hours

interface DormantStudent {
  id: string
  full_name: string
  email: string
  batch_name: string | null
  last_seen: string | null
  hours_since: number
}

// Active students who HAVE logged in at least once but whose last seen
// (max of last activity heartbeat and last sign-in) is older than 48 hours.
async function buildDormant(): Promise<{ students: DormantStudent[]; total: number }> {
  const service = createServiceClient()

  const { data: students } = await service
    .from('student_profiles')
    .select('id, full_name, email, status, last_active_at, auth_user_id, batch_id, batches(name)')
    .eq('status', 'active')

  const roster = students || []

  const signInMap = new Map<string, string | null>()
  let page = 1
  for (;;) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (!data?.users?.length) break
    for (const u of data.users) signInMap.set(u.id, u.last_sign_in_at ?? null)
    if (data.users.length < 1000) break
    page++
  }

  const now = Date.now()
  const dormant: DormantStudent[] = []

  for (const s of roster) {
    if (!s.auth_user_id) continue
    const signIn = signInMap.get(s.auth_user_id) ?? null
    if (!signIn) continue // never logged in -> handled by the other widget

    const times = [s.last_active_at, signIn].filter(Boolean).map((t) => new Date(t as string).getTime())
    const lastSeenMs = times.length ? Math.max(...times) : 0
    if (lastSeenMs === 0 || now - lastSeenMs <= DORMANT_MS) continue

    const batchArr = s.batches as unknown as { name: string }[] | { name: string } | null
    const batch = Array.isArray(batchArr) ? batchArr[0] : batchArr
    dormant.push({
      id: s.id,
      full_name: s.full_name,
      email: s.email,
      batch_name: batch?.name ?? null,
      last_seen: new Date(lastSeenMs).toISOString(),
      hours_since: Math.floor((now - lastSeenMs) / (60 * 60 * 1000)),
    })
  }

  dormant.sort((a, b) => b.hours_since - a.hours_since)
  return { students: dormant, total: roster.length }
}

export async function GET() {
  try {
    await requireAdmin()
    const { students, total } = await buildDormant()
    return NextResponse.json({
      success: true,
      data: { summary: { dormant: students.length, total_active: total }, students },
    })
  } catch (error) {
    console.error('[admin/dormant-students] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load' } }, { status: 500 })
  }
}

// Re-engagement actions for dormant students.
//  - nudge: in-app + browser/PWA push (via createNotification)
//  - email: a gentle "come back" email (no password reset — they already have
//           working credentials)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const service = createServiceClient()
    const body = await request.json()
    const action = body.action as 'nudge' | 'email'
    const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.filter(Boolean) : []

    if (!action || ids.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'action and student_ids required' } }, { status: 400 })
    }

    const { data: profiles } = await service
      .from('student_profiles')
      .select('id, full_name, email, auth_user_id')
      .in('id', ids)

    const roster = profiles || []
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    let ok = 0
    let failed = 0

    for (const p of roster) {
      try {
        if (action === 'nudge') {
          if (!p.auth_user_id) { failed++; continue }
          // In-app + Web Push (createNotification fans out to push subscriptions).
          await createNotification({
            userId: p.auth_user_id,
            type: 'info',
            title: "We've missed you at Sabudh AI",
            message: "You've been away for a couple of days. Jump back in to mark attendance and keep up with your course.",
            metadata: { source: 'dormant_nudge' },
          })
          ok++
        } else {
          // email — no password reset
          if (!process.env.RESEND_API_KEY) { failed++; continue }
          const result = await resend.emails.send({
            from: FROM_EMAIL,
            to: p.email,
            subject: 'We miss you at Sabudh AI — come back to your course',
            html: reengagementEmail(p.full_name, loginUrl),
          })
          if (result.error) failed++
          else ok++
        }
      } catch {
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        action,
        ok,
        failed,
        message: `${ok} ${action === 'nudge' ? 'nudged' : 'emailed'}${failed ? `, ${failed} failed` : ''}.`,
      },
    })
  } catch (error) {
    console.error('[admin/dormant-students] action error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Action failed' } }, { status: 500 })
  }
}

function reengagementEmail(name: string, loginUrl: string): string {
  const safeName = (name || 'there').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#4f46e5">We miss you, ${safeName}!</h2>
    <p>You haven't been active on the Sabudh AI platform for a couple of days. Your attendance and coursework matter — hop back in so you don't fall behind.</p>
    <p style="margin:24px 0"><a href="${loginUrl}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Log in to Sabudh AI</a></p>
    <p style="color:#666;font-size:13px">If you're having trouble logging in, reply to this email and we'll help.</p>
  </body></html>`
}
