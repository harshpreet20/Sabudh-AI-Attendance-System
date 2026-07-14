import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ENGAGEMENT_THEMES,
  pick,
  firstName,
  getWeather,
  generateEngagementMessage,
} from '@/lib/engagement'

// Generates a few live sample engagement nudges so an admin can preview the
// tone before rollout. Uses a real dormant student's name/city when available,
// otherwise a representative sample. Costs a handful of OpenAI calls.
export async function GET() {
  try {
    await requireAdmin()
    const service = createServiceClient()

    // Try to base the preview on a real student for authenticity.
    const { data: sample } = await service
      .from('student_profiles')
      .select('full_name, city')
      .eq('status', 'active')
      .not('city', 'is', null)
      .limit(1)
      .maybeSingle()

    const name = firstName(sample?.full_name || 'Aman')
    const city = sample?.city || 'Ludhiana'

    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
    const weatherCache = new Map<string, string | null>()

    // Three varied samples.
    const themes = [...ENGAGEMENT_THEMES]
    const chosen = [pick(themes), pick(themes), pick(themes)]

    const samples = await Promise.all(
      chosen.map(async (theme) => {
        const weather = theme === 'weather' ? await getWeather(city, weatherCache) : null
        const msg = await generateEngagementMessage(openai, { name, city, theme, weather })
        return { theme, title: msg.title, body: msg.body }
      }),
    )

    return NextResponse.json({
      success: true,
      data: {
        based_on: { name, city },
        ai: !!openai,
        samples,
      },
    })
  } catch (error) {
    console.error('[engagement-preview] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Preview failed' } }, { status: 500 })
  }
}
