import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

// QR backup-mode tokens are opaque, URL-safe, single-session secrets. They are
// short enough to encode comfortably in a QR code but carry 128 bits of entropy.
export function generateQrToken(): string {
  return randomBytes(18).toString('base64url')
}

// ---------------------------------------------------------------------------
// Dynamic (rotating) QR codes
// ---------------------------------------------------------------------------
// The QR shown to a class rotates every 15 seconds so a screenshot of it is
// worthless within moments — defeating "photograph the QR and send it to an
// absent friend" proxy attendance. Each QR session carries a private `secret`
// (never sent to any client); the on-screen code is HMAC(secret, timeStep).
// The teacher's screen refreshes the code every step by asking the server for
// the current value, and the server independently recomputes it to verify a
// scan. QR content is `${token}.${code}` — the token locates the session's
// secret server-side, the code proves the QR was current when scanned.

export const QR_STEP_SECONDS = 15
// How many prior steps we still accept, to tolerate scan latency / clock skew.
// 1 => a code stays valid up to ~30s (the current step plus the previous one).
const QR_GRACE_STEPS = 1

// A per-session HMAC key. High-entropy and kept server-side only.
export function generateQrSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function currentQrStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_STEP_SECONDS)
}

// Milliseconds until the next rotation boundary (for the on-screen countdown).
export function msUntilNextStep(nowMs: number = Date.now()): number {
  const stepMs = QR_STEP_SECONDS * 1000
  return stepMs - (nowMs % stepMs)
}

// The short, rotating code for a given step. 8 hex chars (~32 bits) is far more
// than enough to make guessing within a 15s window infeasible.
export function rotatingQrCode(secret: string, step: number): string {
  return createHmac('sha256', secret).update(String(step)).digest('hex').slice(0, 8)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

// Accept the current step and up to QR_GRACE_STEPS previous steps.
export function verifyRotatingQrCode(secret: string, code: string, nowMs: number = Date.now()): boolean {
  if (!code) return false
  const step = currentQrStep(nowMs)
  for (let i = 0; i <= QR_GRACE_STEPS; i++) {
    if (constantTimeEqual(rotatingQrCode(secret, step - i), code)) return true
  }
  return false
}

// QR payload is `${token}.${code}`; tokens are base64url (no '.') and codes are
// hex, so splitting on the last '.' is unambiguous. A payload with no '.' is a
// legacy static token.
export function buildQrContent(token: string, code: string): string {
  return `${token}.${code}`
}

export function parseQrContent(raw: string): { token: string; code: string | null } {
  const value = (raw || '').trim()
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return { token: value, code: null }
  return { token: value.slice(0, dot), code: value.slice(dot + 1) }
}

export interface QrTokenRow {
  id: string
  session_id: string
  expires_at: string
  max_uses: number | null
  use_count: number
  revoked_at: string | null
}

export type QrValidation =
  | { valid: true; token: QrTokenRow }
  | { valid: false; reason: 'not_found' | 'expired' | 'revoked' | 'exhausted' }

export function validateQrToken(token: QrTokenRow | null): QrValidation {
  if (!token) return { valid: false, reason: 'not_found' }
  if (token.revoked_at) return { valid: false, reason: 'revoked' }
  if (new Date(token.expires_at).getTime() <= Date.now()) return { valid: false, reason: 'expired' }
  if (token.max_uses != null && token.use_count >= token.max_uses) {
    return { valid: false, reason: 'exhausted' }
  }
  return { valid: true, token }
}

export function qrValidationMessage(reason: 'not_found' | 'expired' | 'revoked' | 'exhausted'): string {
  switch (reason) {
    case 'not_found':
      return 'This QR code is not recognised. Ask your instructor for a fresh code.'
    case 'expired':
      return 'This QR code has expired. Ask your instructor to generate a new one.'
    case 'revoked':
      return 'This QR code has been revoked by your instructor.'
    case 'exhausted':
      return 'This QR code has reached its usage limit.'
  }
}
