import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getSelfieConfig, setSelfieConfig } from '@/lib/selfie-config'

const ADMIN_ROLES = ['admin', 'super_admin']

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
  if (!roles?.some((r) => ADMIN_ROLES.includes(r.role))) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ success: false }, { status: auth.status })
  }
  return NextResponse.json({ success: true, data: await getSelfieConfig() })
}

// Save the config. When reference photos are present, run OpenAI ONCE to build
// a reusable text "understanding" of the room, stored for every future selfie.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ success: false }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const enabled = Boolean(body?.enabled)
    const force = Boolean(body?.force)
    const references: string[] = Array.isArray(body?.references)
      ? body.references.filter((u: unknown) => typeof u === 'string')
      : []

    const current = await getSelfieConfig()
    let description = current.description

    // (Re)analyze when forced, when references changed, or when none exists yet.
    const changed =
      references.length > 0 &&
      (force || references.join('|') !== current.references.join('|') || !description)

    if (changed && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are describing a classroom from reference photos so other photos can later be checked as taken in the SAME room. Describe objective, stable features: floor material/pattern/colour, ceiling and lighting, wall colour, windows/doors, and fixed furniture or equipment layout (screens, desks, ACs, posters). Ignore people. Reply with 3-5 specific sentences, no preamble.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this classroom:' },
                ...references.slice(0, 4).map((url) => ({
                  type: 'image_url' as const,
                  image_url: { url, detail: 'low' as const },
                })),
              ],
            },
          ],
        })
        description = completion.choices[0]?.message?.content?.trim() || description
      } catch (err) {
        console.error('Classroom analysis failed:', err)
      }
    }

    const cfg = { enabled, references, description }
    await setSelfieConfig(cfg)
    return NextResponse.json({ success: true, data: cfg })
  } catch (error) {
    console.error('Selfie config error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save' } },
      { status: 500 }
    )
  }
}
