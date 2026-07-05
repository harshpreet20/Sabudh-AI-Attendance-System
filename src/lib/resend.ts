import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

export const resend = { get emails() { return getResend().emails } }

// Centralized sender address. Must use a domain verified on the Resend account.
// The verified domain is attendanceai.harshpreetbhasin.com.
//
// RESEND_FROM_EMAIL can be set in the environment, but Resend requires a strict
// `email@domain` or `Name <email@domain>` format. Admins often set it to just a
// bare domain, which Resend rejects with "Invalid `from` field". So normalize
// whatever we're given rather than passing it through blindly.
const DEFAULT_FROM = 'Sabudh Foundation <noreply@attendanceai.harshpreetbhasin.com>'

function resolveFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim()
  if (!raw) return DEFAULT_FROM

  const emailOnly = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const namedEmail = /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/
  // Already a valid sender — use as-is.
  if (namedEmail.test(raw) || emailOnly.test(raw)) return raw

  // Bare domain (e.g. "attendanceai.harshpreetbhasin.com") — build a proper sender.
  const bareDomain = /^[^\s@]+\.[^\s@]+$/
  if (bareDomain.test(raw)) return `Sabudh Foundation <noreply@${raw}>`

  // Malformed — fall back to a known-good, correctly formatted address.
  return DEFAULT_FROM
}

export const FROM_EMAIL = resolveFromEmail()

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type EscapedStrings<T> = { [K in keyof T]: T[K] extends string ? string : T[K] }

function escAll<T extends Record<string, unknown>>(params: T): EscapedStrings<T> {
  const result = {} as Record<string, unknown>
  for (const [k, v] of Object.entries(params)) {
    result[k] = typeof v === 'string' ? esc(v) : v
  }
  return result as EscapedStrings<T>
}

export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }
  return password
}

export function leaveStatusEmailHtml(params: {
  studentName: string
  leaveDate: string
  status: 'approved' | 'rejected'
  reviewerNote?: string
}): string {
  const p = escAll(params)
  const statusColor = p.status === 'approved' ? '#10b981' : '#ef4444'
  const statusIcon = p.status === 'approved' ? '✅' : '❌'
  const statusText = p.status === 'approved' ? 'Approved' : 'Rejected'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;">Leave Request ${statusText}</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Sabudh Foundation</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Dear ${p.studentName},</p>
          <p style="color:#f1f5f9;font-size:15px;line-height:1.6;margin:12px 0 0;">
            Your leave request for <strong style="color:#a78bfa;">${p.leaveDate}</strong> has been
            <span style="color:${statusColor};font-weight:700;"> ${statusText.toLowerCase()}</span>.
          </p>
          ${p.reviewerNote ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#c4b5fd;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Reviewer Note</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;">${p.reviewerNote}</p>
            </td></tr>
          </table>` : ''}
        </td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:12px;margin:0;">Sabudh Foundation &bull; GEN AI Course<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function attendanceAlertEmailHtml(params: {
  studentName: string
  attendancePercentage: number
  threshold: number
}): string {
  const p = escAll(params)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(239,68,68,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(239,68,68,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;">Low Attendance Alert</h1>
          <p style="margin:4px 0 0;color:#ef4444;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Action Required</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.5),rgba(234,179,8,0.5),rgba(239,68,68,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Dear ${p.studentName},</p>
          <p style="color:#f1f5f9;font-size:15px;line-height:1.6;margin:12px 0 0;">
            Your current attendance is at <span style="color:#ef4444;font-weight:700;font-size:20px;">${p.attendancePercentage}%</span>,
            which is below the required <span style="color:#fbbf24;font-weight:700;">${p.threshold}%</span> threshold.
          </p>
          <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:16px 0 0;">
            Please ensure you attend upcoming sessions to maintain your eligibility for the course certificate.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:12px;margin:0;">Sabudh Foundation &bull; GEN AI Course<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function weeklyDigestEmailHtml(params: {
  studentName: string
  weeklyPercentage: number
  overallPercentage: number
  sessionsAttended: number
  totalSessions: number
  weekStart: string
  weekEnd: string
}): string {
  const p = escAll(params)
  const color = p.weeklyPercentage >= 75 ? '#10b981' : p.weeklyPercentage >= 50 ? '#f59e0b' : '#ef4444'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;">Weekly Attendance Report</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">${p.weekStart} to ${p.weekEnd}</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">Dear ${p.studentName},</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;">
            <tr>
              <td style="padding:20px;text-align:center;width:50%;border-right:1px solid rgba(139,92,246,0.15);">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">This Week</p>
                <p style="margin:8px 0 0;color:${color};font-size:32px;font-weight:800;">${p.weeklyPercentage}%</p>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${p.sessionsAttended}/${p.totalSessions} sessions</p>
              </td>
              <td style="padding:20px;text-align:center;width:50%;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Overall</p>
                <p style="margin:8px 0 0;color:#a78bfa;font-size:32px;font-weight:800;">${p.overallPercentage}%</p>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">cumulative</p>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:12px;margin:0;">Sabudh Foundation &bull; GEN AI Course<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function signupConfirmationEmailHtml(params: {
  confirmUrl: string
}): string {
  const p = escAll(params)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">Confirm Your Email</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Sabudh AI</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:0;">
            Thank you for signing up. Please confirm your email address by clicking the button below.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${p.confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
              Confirm Email Address
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
            If you did not create an account, you can safely ignore this email. This link will expire in 24 hours.
          </p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function passwordResetEmailHtml(params: {
  resetUrl: string
}): string {
  const p = escAll(params)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">Reset Your Password</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Sabudh AI</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:0;">
            We received a request to reset your password. Click the button below to choose a new password.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${p.resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
              Reset Password
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
            If you did not request a password reset, please ignore this email. Your password will remain unchanged. This link will expire in 1 hour.
          </p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function passwordChangedEmailHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(34,197,94,0.12) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">Password Changed</h1>
          <p style="margin:4px 0 0;color:#22c55e;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Confirmed</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(34,197,94,0.4),rgba(139,92,246,0.4),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:0;">
            Your password has been successfully updated. You can now sign in with your new password.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;color:#fca5a5;font-size:13px;line-height:1.5;">
                If you did not make this change, please reset your password immediately or contact support.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function welcomeEmailHtml(params: {
  studentName: string
  email: string
  password: string
  courseName: string
  location: string
  loginUrl: string
}): string {
  const p = escAll(params)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">

          <!-- Header with divine glow -->
          <tr>
            <td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
              <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
              <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;letter-spacing:0.5px;">
                Sabudh Foundation
              </h1>
              <p style="margin:4px 0 0;color:#8b5cf6;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">
                Illuminating Minds Through AI
              </p>
            </td>
          </tr>

          <!-- Decorative divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div>
            </td>
          </tr>

          <!-- Welcome message -->
          <tr>
            <td style="padding:30px 40px 20px;">
              <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Sat Sri Akal 🙏</p>
              <h2 style="margin:0;color:#f1f5f9;font-size:22px;font-weight:600;">
                Welcome, ${p.studentName}
              </h2>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:12px 0 0;">
                You have been enrolled in the <strong style="color:#a78bfa;">${p.courseName}</strong> program.
                Your journey from zero to one in Generative AI begins now, where ancient wisdom meets cutting-edge technology.
              </p>
            </td>
          </tr>

          <!-- Credentials card -->
          <tr>
            <td style="padding:10px 40px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 16px;color:#c4b5fd;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">
                      🔐 Your Login Credentials
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#94a3b8;font-size:13px;">Email</span><br>
                          <span style="color:#f1f5f9;font-size:15px;font-family:monospace;background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;display:inline-block;margin-top:4px;">${p.email}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#94a3b8;font-size:13px;">Temporary Password</span><br>
                          <span style="color:#fbbf24;font-size:15px;font-family:monospace;font-weight:700;background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;display:inline-block;margin-top:4px;">${p.password}</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;color:#f87171;font-size:12px;">
                      ⚠️ Please change your password after first login
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Login button -->
          <tr>
            <td style="padding:10px 40px;text-align:center;">
              <a href="${p.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.5px;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
                Login to Dashboard
              </a>
            </td>
          </tr>

          <!-- Profile completion reminder -->
          <tr>
            <td style="padding:10px 40px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;color:#4ade80;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">
                      Next Step
                    </p>
                    <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.5;">
                      After logging in, please complete your profile by uploading a recent photo and filling in your personal details. This is required for attendance verification.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Location info -->
          <tr>
            <td style="padding:20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#fbbf24;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">
                      📍 Class Location
                    </p>
                    <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.5;">
                      ${p.location}
                    </p>
                    <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">
                      Attendance is location-verified. Please be within 500m of the centre
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Decorative divider -->
          <tr>
            <td style="padding:10px 40px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.3),rgba(234,179,8,0.3),rgba(139,92,246,0.3),transparent);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 30px;text-align:center;">
              <p style="color:#64748b;font-size:12px;margin:0;line-height:1.6;">
                "Where seva meets silicon, wisdom flows through every node."
              </p>
              <p style="color:#475569;font-size:11px;margin:12px 0 0;">
                Sabudh Foundation &bull; GEN AI Course<br>
                GK Duggal Memorial Centre, Rajouri Garden, New Delhi
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function teacherWelcomeEmailHtml(params: {
  teacherName: string
  email: string
  password: string
  courseName: string
  location: string
  loginUrl: string
}): string {
  const p = escAll(params)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;">Sabudh Foundation</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Instructor Portal</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px 20px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Sat Sri Akal 🙏</p>
          <h2 style="margin:0;color:#f1f5f9;font-size:22px;font-weight:600;">Welcome, ${p.teacherName}</h2>
          <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:12px 0 0;">
            You have been added as an <strong style="color:#a78bfa;">Instructor</strong> for the
            <strong style="color:#a78bfa;">${p.courseName}</strong> program.
            You now have access to the Teacher Dashboard where you can manage sessions, mark attendance, grade assignments, and more.
          </p>
        </td></tr>
        <tr><td style="padding:10px 40px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;">
            <tr><td style="padding:24px;">
              <p style="margin:0 0 16px;color:#c4b5fd;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">🔐 Your Login Credentials</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;">
                  <span style="color:#94a3b8;font-size:13px;">Email</span><br>
                  <span style="color:#f1f5f9;font-size:15px;font-family:monospace;background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;display:inline-block;margin-top:4px;">${p.email}</span>
                </td></tr>
                <tr><td style="padding:8px 0;">
                  <span style="color:#94a3b8;font-size:13px;">Temporary Password</span><br>
                  <span style="color:#fbbf24;font-size:15px;font-family:monospace;font-weight:700;background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;display:inline-block;margin-top:4px;">${p.password}</span>
                </td></tr>
              </table>
              <p style="margin:16px 0 0;color:#f87171;font-size:12px;">⚠️ Please change your password after first login</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:10px 40px;text-align:center;">
          <a href="${p.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 15px rgba(124,58,237,0.4);">Login to Teacher Dashboard</a>
        </td></tr>
        <tr><td style="padding:10px 40px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#4ade80;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">What You Can Do</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.8;">
                • Create and manage class sessions<br>
                • Open attendance windows with verification words<br>
                • Grant grace attendance and grace marks<br>
                • Upload curriculum materials and assignments<br>
                • Grade student submissions (manual + AI-assisted)<br>
                • Manage discussions and announcements<br>
                • Track student progress and generate reports
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:12px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;color:#fbbf24;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">📍 Class Location</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.5;">${p.location}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:10px 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.3),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:12px;margin:0;line-height:1.6;">"Where seva meets silicon, wisdom flows through every node."</p>
          <p style="color:#475569;font-size:11px;margin:12px 0 0;">Sabudh Foundation &bull; ${p.courseName}<br>${p.location}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function approvalNotificationEmailHtml(params: {
  studentName: string
  status: 'approved' | 'rejected'
  loginUrl: string
  batchName?: string
}): string {
  const p = escAll(params)
  const approved = p.status === 'approved'
  const statusColor = approved ? '#10b981' : '#ef4444'
  const statusIcon = approved ? '✅' : '❌'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:24px;font-weight:700;">Account ${approved ? 'Approved' : 'Not Approved'}</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:13px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Sabudh AI</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Dear ${p.studentName},</p>
          ${approved ? `
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:12px 0 0;">
            Great news! Your account has been <span style="color:${statusColor};font-weight:700;">approved</span>.
            ${p.batchName ? `You have been assigned to <strong style="color:#a78bfa;">${p.batchName}</strong>.` : ''}
            You can now access all platform features.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${p.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
              Go to Dashboard
            </a>
          </div>` : `
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:12px 0 0;">
            Unfortunately, your account registration has not been approved at this time.
            If you believe this was a mistake, please contact the administration.
          </p>`}
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function registrationPendingEmailHtml(params: {
  userName: string
  role: 'student' | 'teacher'
  loginUrl: string
}): string {
  const p = escAll(params)
  const roleLabel = p.role === 'teacher' ? 'Instructor' : 'Student'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">Registration Received</h1>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Sabudh AI</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;">Sat Sri Akal 🙏</p>
          <h2 style="margin:0;color:#f1f5f9;font-size:20px;font-weight:600;">Welcome, ${p.userName}!</h2>
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:16px 0 0;">
            Thank you for registering as a <strong style="color:#a78bfa;">${roleLabel}</strong> on the Sabudh AI Attendance System.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.2);border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#fbbf24;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">What Happens Next</p>
              <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your account is <strong style="color:#fbbf24;">pending admin approval</strong>. An administrator will review your registration and approve your account shortly. You will receive another email once your account has been activated.
              </p>
            </td></tr>
          </table>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
            Once approved, you can log in at the link below to access your dashboard.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${p.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
              Visit Sabudh AI
            </a>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function newSignupAdminEmailHtml(params: {
  userName: string
  userEmail: string
  role: 'student' | 'teacher'
  approvalsUrl: string
}): string {
  const p = escAll(params)
  const roleLabel = p.role === 'teacher' ? 'Instructor' : 'Student'
  const roleColor = p.role === 'teacher' ? '#f59e0b' : '#8b5cf6'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">New Registration</h1>
          <p style="margin:4px 0 0;color:${roleColor};font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">${roleLabel} Signup</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:0 0 16px;">
            A new <strong style="color:${roleColor};">${roleLabel}</strong> has signed up and is awaiting your approval.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:12px;">
            <tr><td style="padding:20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;">
                  <span style="color:#94a3b8;font-size:13px;">Name</span><br>
                  <span style="color:#f1f5f9;font-size:15px;font-weight:600;">${p.userName}</span>
                </td></tr>
                <tr><td style="padding:6px 0;">
                  <span style="color:#94a3b8;font-size:13px;">Email</span><br>
                  <span style="color:#f1f5f9;font-size:15px;">${p.userEmail}</span>
                </td></tr>
                <tr><td style="padding:6px 0;">
                  <span style="color:#94a3b8;font-size:13px;">Role</span><br>
                  <span style="color:${roleColor};font-size:15px;font-weight:600;">${roleLabel}</span>
                </td></tr>
              </table>
            </td></tr>
          </table>
          <div style="text-align:center;margin:28px 0;">
            <a href="${p.approvalsUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 15px rgba(124,58,237,0.4);">
              Review &amp; Approve
            </a>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function announcementEmailHtml(params: {
  studentName: string
  title: string
  content: string
  priority: string
  dashboardUrl: string
}): string {
  const p = escAll(params)
  const priorityColors: Record<string, string> = {
    urgent: '#ef4444',
    high: '#f97316',
    normal: '#8b5cf6',
    low: '#6b7280',
  }
  const color = priorityColors[p.priority] || '#8b5cf6'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f1628 0%,#1a1a3e 50%,#0f1628 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
        <tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(180deg,rgba(139,92,246,0.15) 0%,transparent 100%);">
          <img src="https://attendanceai.harshpreetbhasin.com/sabudh-logo.png" width="140" height="auto" alt="Sabudh AI" style="display:block;margin:0 auto 12px;" />
          <h1 style="margin:0;color:#e2e8f0;font-size:22px;font-weight:700;">New Announcement</h1>
          <p style="margin:4px 0 0;color:${color};font-size:12px;text-transform:uppercase;letter-spacing:3px;font-weight:600;">${p.priority} Priority</p>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.5),rgba(234,179,8,0.5),rgba(139,92,246,0.5),transparent);"></div></td></tr>
        <tr><td style="padding:30px 40px;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">Dear ${p.studentName},</p>
          <h2 style="margin:0 0 12px;color:#f1f5f9;font-size:18px;font-weight:600;">${p.title}</h2>
          <p style="color:#e2e8f0;font-size:14px;line-height:1.7;margin:0;">${p.content.slice(0, 500)}${p.content.length > 500 ? '...' : ''}</p>
          <div style="text-align:center;margin:28px 0 0;">
            <a href="${p.dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 15px rgba(124,58,237,0.4);">View on Dashboard</a>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.2),transparent);"></div></td></tr>
        <tr><td style="padding:20px 40px 30px;text-align:center;">
          <p style="color:#64748b;font-size:11px;margin:0;line-height:1.5;">Sabudh Foundation<br>GK Duggal Memorial Centre, Rajouri Garden, New Delhi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
