import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  generateQrToken,
  generateQrSecret,
  rotatingQrCode,
  currentQrStep,
  msUntilNextStep,
  buildQrContent,
  QR_STEP_SECONDS,
} from '@/lib/qr-token'

const DEFAULT_TTL_SECONDS = 900 // 15 minutes — safe now that the code rotates
const MAX_TTL_SECONDS = 3600

// Build the live rotating-code fields for a token row (staff-only response).
function rotationFields(row: { token: string; secret: string | null }) {
  if (!row.secret) return { rotating: false as const }
  const now = Date.now()
  const code = rotatingQrCode(row.secret, currentQrStep(now))
  return {
    rotating: true as const,
    step_seconds: QR_STEP_SECONDS,
    current_code: code,
    content: buildQrContent(row.token, code),
    next_rotation_ms: msUntilNextStep(now),
  }
}

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null }
  const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  return { user, role: role?.role ?? null }
}

// GET: return the currently active QR token for a session (if any).
export async function GET(request: NextRequest) {
  const { user, role } = await requireStaff()
  if (!user || !['instructor', 'admin', 'super_admin'].includes(role || '')) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
  }

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'session_id required' } }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: token } = await supabase
    .from('attendance_qr_tokens')
    .select('id, token, secret, session_id, expires_at, max_uses, use_count, revoked_at, created_at')
    .eq('session_id', sessionId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!token) return NextResponse.json({ success: true, data: null })

  // Never leak the secret; expose only the current rotating code + timing.
  const { secret, ...safe } = token
  void secret
  return NextResponse.json({ success: true, data: { ...safe, ...rotationFields(token) } })
}

// POST: generate a fresh, time-limited QR token for a session. Any previous
// active token for that session is revoked so only one code is ever live.
export async function POST(request: NextRequest) {
  const { user, role } = await requireStaff()
  if (!user || !['instructor', 'admin', 'super_admin'].includes(role || '')) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const sessionId: string | undefined = body.session_id
  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(30, Number(body.ttl_seconds) || DEFAULT_TTL_SECONDS))
  const maxUses: number | null = body.max_uses != null ? Number(body.max_uses) : null

  if (!sessionId) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'session_id required' } }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } }, { status: 404 })
  }

  // Revoke any previously live token for this session.
  await supabase
    .from('attendance_qr_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('revoked_at', null)

  const token = generateQrToken()
  const secret = generateQrSecret()
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

  const { data: inserted, error } = await supabase
    .from('attendance_qr_tokens')
    .insert({
      session_id: sessionId,
      token,
      secret,
      created_by: user.id,
      expires_at: expiresAt,
      max_uses: maxUses,
    })
    .select('id, token, session_id, expires_at, max_uses, use_count')
    .single()

  if (error) {
    console.error('[teacher/qr] insert error:', error.message)
    return NextResponse.json({ success: false, error: { code: 'INSERT_FAILED', message: 'Failed to create QR token' } }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { ...inserted, ...rotationFields({ token, secret }) } })
}

// DELETE: revoke the active token for a session.
export async function DELETE(request: NextRequest) {
  const { user, role } = await requireStaff()
  if (!user || !['instructor', 'admin', 'super_admin'].includes(role || '')) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } }, { status: 403 })
  }

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'session_id required' } }, { status: 400 })
  }

  const supabase = createServiceClient()
  await supabase
    .from('attendance_qr_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('revoked_at', null)

  return NextResponse.json({ success: true })
}
