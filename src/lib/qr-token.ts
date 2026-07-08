import { randomBytes } from 'crypto'

// QR backup-mode tokens are opaque, URL-safe, single-session secrets. They are
// short enough to encode comfortably in a QR code but carry 128 bits of entropy.
export function generateQrToken(): string {
  return randomBytes(18).toString('base64url')
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
