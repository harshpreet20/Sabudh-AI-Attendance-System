import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const PAGES_TO_SCRAPE = [
  { url: '/', title: 'Home Page', category: 'platform' },
  { url: '/login', title: 'Login Page', category: 'auth' },
  { url: '/register', title: 'Registration Page', category: 'auth' },
]

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'vercel.app') || 'http://localhost:3000'

  const results: Array<{ url: string; status: string }> = []

  for (const page of PAGES_TO_SCRAPE) {
    try {
      const res = await fetch(`${baseUrl}${page.url}`, {
        headers: { 'User-Agent': 'SabudhAI-Scraper/1.0' },
      })

      if (!res.ok) {
        results.push({ url: page.url, status: `error: ${res.status}` })
        continue
      }

      const html = await res.text()

      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)

      if (!textContent || textContent.length < 50) {
        results.push({ url: page.url, status: 'skipped: too short' })
        continue
      }

      const { data: existing } = await supabase
        .from('chatbot_knowledge')
        .select('id')
        .eq('source', 'scrape')
        .eq('source_url', page.url)
        .eq('organization_id', ORG_ID)
        .single()

      if (existing) {
        await supabase
          .from('chatbot_knowledge')
          .update({
            content: textContent,
            title: page.title,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('chatbot_knowledge')
          .insert({
            organization_id: ORG_ID,
            title: page.title,
            content: textContent,
            source: 'scrape',
            source_url: page.url,
            category: page.category,
          })
      }

      results.push({ url: page.url, status: 'ok' })
    } catch (err) {
      results.push({ url: page.url, status: `error: ${err instanceof Error ? err.message : 'unknown'}` })
    }
  }

  const { data: platformData } = await supabase
    .from('student_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)

  const { data: batchData } = await supabase
    .from('batches')
    .select('id, name, status')
    .limit(20)

  const { data: scheduleData } = await supabase
    .from('class_schedules')
    .select('title, scheduled_date, start_time, end_time, status')
    .eq('organization_id', ORG_ID)
    .gte('scheduled_date', new Date().toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true })
    .limit(10)

  const { data: announcementData } = await supabase
    .from('announcements')
    .select('title, content, priority, published_at')
    .eq('organization_id', ORG_ID)
    .order('published_at', { ascending: false })
    .limit(5)

  const platformSummary = [
    `Total students: ${platformData?.length ?? 'unknown'}`,
    `Active batches: ${batchData?.filter(b => b.status === 'active').map(b => b.name).join(', ') || 'none'}`,
    scheduleData?.length ? `Upcoming schedules: ${scheduleData.map(s => `${s.title} on ${s.scheduled_date}`).join('; ')}` : '',
    announcementData?.length ? `Recent announcements: ${announcementData.map(a => `${a.title} (${a.priority})`).join('; ')}` : '',
  ].filter(Boolean).join('\n')

  if (platformSummary) {
    const { data: existing } = await supabase
      .from('chatbot_knowledge')
      .select('id')
      .eq('source', 'scrape')
      .eq('source_url', '/platform-summary')
      .eq('organization_id', ORG_ID)
      .single()

    const doc = {
      organization_id: ORG_ID,
      title: 'Platform Activity Summary',
      content: platformSummary,
      source: 'scrape',
      source_url: '/platform-summary',
      category: 'activity',
    }

    if (existing) {
      await supabase.from('chatbot_knowledge').update({ ...doc, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('chatbot_knowledge').insert(doc)
    }
  }

  return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() })
}
