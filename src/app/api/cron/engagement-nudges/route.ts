import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/notifications'
import {
  ENGAGEMENT_THEMES,
  pick,
  shuffle,
  firstName,
  getWeather,
  generateEngagementMessage,
} from '@/lib/engagement'

// OPTIONAL server-side cron. The primary path is now the PWA self-nudge
// (periodic background sync), which needs no Vercel Pro / CRON_SECRET. This cron
// remains for environments that prefer central scheduling and can also reach
// users who have a Web Push (VAPID) subscription even when the app is closed.

const DORMANT_MS = 48 * 60 * 60 * 1000
const COOLDOWN_MS = 6 * 60 * 60 * 1000
const MAX_PER_RUN = 40

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: subs } = await supabase.from('push_subscriptions').select('user_id')
  const pushUserIds = new Set((subs || []).map((s) => s.user_id))
  if (pushUserIds.size === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'No push subscribers yet' })
  }

  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, full_name, city, last_active_at, auth_user_id, status')
    .eq('status', 'active')

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
    if (!signIn) return false
    const times = [s.last_active_at, signIn].filter(Boolean).map((t) => new Date(t as string).getTime())
    const lastSeen = times.length ? Math.max(...times) : 0
    return lastSeen > 0 && now - lastSeen > DORMANT_MS
  })

  const { data: recent } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'info')
    .contains('metadata', { source: 'engagement_cron' })
    .gte('created_at', new Date(now - COOLDOWN_MS).toISOString())
  const recentlyNudged = new Set((recent || []).map((r) => r.user_id))

  const targets = shuffle(candidates.filter((s) => !recentlyNudged.has(s.auth_user_id!))).slice(0, MAX_PER_RUN)
  if (targets.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'No dormant push-subscribed students to nudge' })
  }

  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
  const weatherCache = new Map<string, string | null>()

  let sent = 0
  let failed = 0
  for (const s of targets) {
    try {
      const theme = pick(ENGAGEMENT_THEMES)
      const weather = (theme === 'weather' || Math.random() < 0.3) && s.city ? await getWeather(s.city, weatherCache) : null
      const msg = await generateEngagementMessage(openai, { name: firstName(s.full_name), city: s.city || '', theme, weather })
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
