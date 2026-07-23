// Baidu OCR backup provider. Used when the primary (OpenAI vision) is
// unavailable or fails. Baidu returns raw text lines; we match them to the
// roster with a heuristic, and the teacher reviews before anything is saved.
//
// Requires BAIDU_OCR_API_KEY and BAIDU_OCR_SECRET_KEY (Baidu AI Cloud, OCR).

interface CachedToken {
  token: string
  expiresAt: number
}
let cachedToken: CachedToken | null = null

export function isBaiduOcrConfigured(): boolean {
  return Boolean(process.env.BAIDU_OCR_API_KEY && process.env.BAIDU_OCR_SECRET_KEY)
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }
  const key = process.env.BAIDU_OCR_API_KEY
  const secret = process.env.BAIDU_OCR_SECRET_KEY
  if (!key || !secret) return null

  const url =
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.access_token) return null

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 2_592_000) * 1000,
  }
  return cachedToken.token
}

/** Extract text lines from an image data URL via Baidu OCR, or null on failure. */
export async function baiduOcrLines(imageDataUrl: string): Promise<string[] | null> {
  if (!isBaiduOcrConfigured()) return null
  const token = await getAccessToken()
  if (!token) return null

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const body = new URLSearchParams({ image: base64 }).toString()

  const res = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (data?.error_code) {
    console.error('Baidu OCR error:', data.error_code, data.error_msg)
    return null
  }
  return (data?.words_result ?? []).map((w: { words: string }) => w.words)
}

const PRESENT_RE = /(present|✓|✔|√|✅|\btick\b|\byes\b|\bp\b|उपस्थित|हाज़िर|हाजिर)/i
const ABSENT_RE = /(absent|✗|✘|✕|\bno\b|\ba\b|अनुपस्थित|ग़ैरहाज़िर|गैरहाजिर)/i

function normalize(s: string): string {
  // Keep latin + Devanagari letters/digits; drop spacing and punctuation.
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '')
}

interface RosterEntry {
  id: string
  name: string
}

/**
 * Best-effort mapping of OCR text lines to the roster. For each student we find
 * the line mentioning their name and read a present/absent marker on that line.
 * Heuristic by nature — the teacher confirms before saving.
 */
export interface BaiduMatch {
  student_id: string
  name: string
  present: boolean
  /** Whether this student's name was found in the OCR text (a quality signal). */
  matched: boolean
}

export function matchRosterFromLines(
  roster: RosterEntry[],
  lines: string[]
): BaiduMatch[] {
  const normLines = lines.map((l) => ({ raw: l, norm: normalize(l) }))

  return roster.map((student) => {
    const fullNorm = normalize(student.name)
    let line = normLines.find((l) => fullNorm.length > 0 && l.norm.includes(fullNorm))

    if (!line) {
      const parts = student.name
        .split(/\s+/)
        .map(normalize)
        .filter((p) => p.length >= 3)
      line = normLines.find((l) => parts.some((p) => l.norm.includes(p)))
    }

    let present = false
    if (line) {
      const hasPresent = PRESENT_RE.test(line.raw)
      const hasAbsent = ABSENT_RE.test(line.raw)
      present = hasPresent && !hasAbsent
    }
    return {
      student_id: student.id,
      name: student.name,
      present,
      matched: Boolean(line),
    }
  })
}
