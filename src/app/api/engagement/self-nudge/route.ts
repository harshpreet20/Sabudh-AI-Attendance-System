import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ENGAGEMENT_THEMES, pick, firstName, getWeather, generateEngagementMessage } from '@/lib/engagement'

const DORMANT_MS = 48 * 60 * 60 * 1000
const COOLDOWN_MS = 6 * 60 * 60 * 1000

// Called by the service worker's periodic background sync. Decides — for the
// currently signed-in user — whether they are "due" for a re-engagement nudge
// (dormant >48h, past cooldown, with a little random timing variety), and if so
// returns a fresh AI-generated message for the SW to show locally. No server
// cron, VAPID or Vercel Pro required — the installed PWA schedules itself.
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ notify: false, reason: 'unauthenticated' }, { status: 200 })
    }

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, full_name, city, last_active_at')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    // Only nudge students who have logged in before but drifted away.
    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0
    const lastActive = profile?.last_active_at ? new Date(profile.last_active_at).getTime() : 0
    const lastSeen = Math.max(lastSignIn, lastActive)
    const now = Date.now()

    if (!profile || lastSeen === 0 || now - lastSeen <= DORMANT_MS) {
      return NextResponse.json({ notify: false, reason: 'active' })
    }

    const service = createServiceClient()

    // Cooldown: don't nudge more than once per COOLDOWN window.
    const { data: recent } = await service
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .in('type', ['info'])
      .gte('created_at', new Date(now - COOLDOWN_MS).toISOString())
      .contains('metadata', { source: 'self_nudge' })
      .limit(1)
    if (recent && recent.length > 0) {
      return NextResponse.json({ notify: false, reason: 'cooldown' })
    }

    // A little random timing variety so nudges don't feel mechanical.
    if (Math.random() < 0.15) {
      return NextResponse.json({ notify: false, reason: 'random_skip' })
    }

    const theme = pick(ENGAGEMENT_THEMES)
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
    const weather = (theme === 'weather' || Math.random() < 0.3) && profile.city ? await getWeather(profile.city) : null
    const msg = await generateEngagementMessage(openai, {
      name: firstName(profile.full_name),
      city: profile.city || '',
      theme,
      weather,
    })

    // Record it in-app (bell) — the SW shows the OS notification from the body.
    await service.from('notifications').insert({
      user_id: user.id,
      type: 'info',
      title: msg.title,
      message: msg.body,
      metadata: { source: 'self_nudge', theme, city: profile.city || null },
    })

    return NextResponse.json({ notify: true, title: msg.title, body: msg.body })
  } catch (error) {
    console.error('[self-nudge] error:', error)
    return NextResponse.json({ notify: false, reason: 'error' }, { status: 200 })
  }
}
