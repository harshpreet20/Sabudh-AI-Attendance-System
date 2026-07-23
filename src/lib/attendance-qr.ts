import crypto from 'crypto'

// The QR shown by the teacher rotates: the embedded code is only valid for a
// short time window, so a screenshot can't be reused later. No storage needed —
// the code is an HMAC over (session, time-window) that the server recomputes.

const INTERVAL_MS = 15000 // code changes every 15s
const SIG_LENGTH = 16

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'sabudh-attendance-qr-dev-secret'
}

function currentWindow(): number {
  return Math.floor(Date.now() / INTERVAL_MS)
}

function sign(sessionId: string, win: number): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`${sessionId}.${win}`)
    .digest('hex')
    .slice(0, SIG_LENGTH)
}

export interface QrToken {
  token: string
  /** Milliseconds until the current code rotates. */
  expiresInMs: number
}

/** Build the current rotating token for a session (format: sessionId.window.sig). */
export function generateQrToken(sessionId: string): QrToken {
  const win = currentWindow()
  return {
    token: `${sessionId}.${win}.${sign(sessionId, win)}`,
    expiresInMs: INTERVAL_MS - (Date.now() % INTERVAL_MS),
  }
}

/** Parse the session id out of a scanned token, or null if malformed. */
export function sessionIdFromToken(token: string): string | null {
  const parts = token.split('.')
  return parts.length === 3 && parts[0] ? parts[0] : null
}

/**
 * Verify a scanned token belongs to the given session and is still fresh
 * (current or previous window, to allow for scan latency and clock skew).
 */
export function verifyQrToken(token: string, sessionId: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [sid, winStr, sig] = parts
  if (sid !== sessionId) return false
  const win = Number.parseInt(winStr, 10)
  if (!Number.isFinite(win)) return false

  const cur = currentWindow()
  if (win !== cur && win !== cur - 1) return false

  const expected = sign(sessionId, win)
  if (sig.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
