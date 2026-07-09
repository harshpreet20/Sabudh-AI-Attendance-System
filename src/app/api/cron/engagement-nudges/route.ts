import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/notifications'

// AI-generated re-engagement push notifications, fired on a cron a few times a
// day. Each run targets dormant students (>48h inactive) who have a browser/PWA
// push subscription, picks a random "theme" per student (weather, local slang,
// motivational, FOMO, curiosity…), optionally folds in the live weather for
// their city, and asks OpenAI to write a short, punchy notification. Content
// therefore changes every run. A cooldown prevents spamming the same student.

const DORMANT_MS = 48 * 60 * 60 * 1000
const COOLDOWN_MS = 6 * 60 * 60 * 1000 // don't nudge the same student within 6h
const MAX_PER_RUN = 40

const THEMES = [
  'local_slang', 'weather', 'motivational', 'fomo', 'curiosity', 'friendly_nudge', 'streak',
] as const
type Theme = (typeof THEMES)[number]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Only students who can actually receive a push right now.
  const { data: subs } = await supabase.from('push_subscriptions').select('user_id')
  const pushUserIds = new Set((subs || []).map((s) => s.user_id))
  if (pushUserIds.size === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'No push subscribers yet' })
  }

  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, full_name, city, last_active_at, auth_user_id, status')
    .eq('status', 'active')

  // Last sign-in map from auth.
  const signInMap = new Map<string, string | null>()
  let page = 1
  for (;;) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (!data?.users?.length) break
    for (const u of data.users) signInMap.set(u.id, u.last_sign_in_at ?? null)
    if (data.users.length < 1000) break
    page++
  }

  const now = Date.now()
  const candidates = (students || []).filter((s) => {
    if (!s.auth_user_id || !pushUserIds.has(s.auth_user_id)) return false
    const signIn = signInMap.get(s.auth_user_id) ?? null
    if (!signIn) return false // never logged in -> email flow, not push
    const times = [s.last_active_at, signIn].filter(Boolean).map((t) => new Date(t as string).getTime())
    const lastSeen = times.length ? Math.max(...times) : 0
    return lastSeen > 0 && now - lastSeen > DORMANT_MS
  })

  // Recent-nudge cooldown.
  const { data: recent } = await supabase
    .from('notifications')
    .select('user_id, created_at')
    .eq('type', 'info')
    .contains('metadata', { source: 'engagement_cron' })
    .gte('created_at', new Date(now - COOLDOWN_MS).toISOString())
  const recentlyNudged = new Set((recent || []).map((r) => r.user_id))

  const targets = shuffle(candidates.filter((s) => !recentlyNudged.has(s.auth_user_id!))).slice(0, MAX_PER_RUN)
  if (targets.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'No dormant push-subscribed students to nudge right now' })
  }

  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
  const weatherCache = new Map<string, string | null>()

  let sent = 0
  let failed = 0

  for (const s of targets) {
    try {
      const theme = pick(THEMES)
      let weather: string | null = null
      if ((theme === 'weather' || Math.random() < 0.3) && s.city) {
        weather = await getWeather(s.city, weatherCache)
      }
      const msg = await generateMessage(openai, {
        name: firstName(s.full_name),
        city: s.city || '',
        theme,
        weather,
      })
      await createNotification({
        userId: s.auth_user_id!,
        type: 'info',
        title: msg.title,
        message: msg.body,
        metadata: { source: 'engagement_cron', theme, city: s.city || null },
      })
      sent++
    } catch (err) {
      console.error('[engagement-nudges] failed for', s.id, err instanceof Error ? err.message : err)
      failed++
    }
  }

  return NextResponse.json({ success: true, sent, failed, considered: candidates.length, timestamp: new Date().toISOString() })
}

function firstName(full: string): string {
  return (full || 'there').trim().split(/\s+/)[0]
}

// --- Live weather via open-meteo (no API key) -------------------------------
async function getWeather(city: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = city.toLowerCase().trim()
  if (cache.has(key)) return cache.get(key)!
  let result: string | null = null
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { signal: AbortSignal.timeout(4000) },
    ).then((r) => r.json())
    const loc = geo?.results?.[0]
    if (loc) {
      const wx = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`,
        { signal: AbortSignal.timeout(4000) },
      ).then((r) => r.json())
      const t = wx?.current?.temperature_2m
      const code = wx?.current?.weather_code
      if (t != null) result = `${Math.round(t)}°C, ${weatherCodeText(code)}`
    }
  } catch {
    result = null
  }
  cache.set(key, result)
  return result
}

function weatherCodeText(code: number | undefined): string {
  if (code == null) return 'clear'
  if (code === 0) return 'clear skies'
  if (code <= 3) return 'partly cloudy'
  if (code <= 48) return 'foggy'
  if (code <= 67) return 'rainy'
  if (code <= 77) return 'snowy'
  if (code <= 82) return 'rain showers'
  if (code <= 99) return 'thunderstorms'
  return 'mixed weather'
}

// --- OpenAI message generation ---------------------------------------------
interface GenInput { name: string; city: string; theme: Theme; weather: string | null }

async function generateMessage(openai: OpenAI | null, input: GenInput): Promise<{ title: string; body: string }> {
  if (!openai) return fallback(input)
  try {
    const styleGuide: Record<Theme, string> = {
      local_slang: `Use light, friendly local slang/flavour appropriate to ${input.city || 'their region'} in India (keep it readable, mostly English).`,
      weather: input.weather ? `Reference today's weather in ${input.city} (${input.weather}) naturally.` : 'Reference the time of day or season lightly.',
      motivational: 'Be uplifting and momentum-focused.',
      fomo: 'Create gentle fear-of-missing-out about class/updates they are missing.',
      curiosity: 'Spark curiosity — hint there is something new waiting for them.',
      friendly_nudge: 'Warm, casual, like a friend checking in.',
      streak: 'Frame it around not breaking their learning streak/consistency.',
    }
    const prompt = `Write a mobile push notification to re-engage a student named ${input.name} who hasn't opened their attendance & learning app (Sabudh AI) in a few days.
Style: ${styleGuide[input.theme]}
Rules: friendly, non-preachy, prompt them to open the app / mark attendance. Body max 16 words. Title max 4 words. No emojis unless they fit naturally (max 1).
Return ONLY compact JSON: {"title":"...","body":"..."}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 90,
      temperature: 1.0,
    })
    const raw = completion.choices[0]?.message?.content?.trim() || ''
    const json = JSON.parse(raw.replace(/^```json/i, '').replace(/```$/, '').trim())
    if (json.title && json.body) return { title: String(json.title).slice(0, 60), body: String(json.body).slice(0, 180) }
  } catch {
    // fall through
  }
  return fallback(input)
}

function fallback(input: GenInput): { title: string; body: string } {
  const bodies = [
    `Hey ${input.name}, your class is waiting — open Sabudh AI and mark today's attendance.`,
    `${input.name}, don't miss out! Tap in to catch up on your course.`,
    `We've missed you, ${input.name}. Jump back into Sabudh AI today.`,
  ]
  return { title: 'Sabudh AI', body: pick(bodies) }
}
