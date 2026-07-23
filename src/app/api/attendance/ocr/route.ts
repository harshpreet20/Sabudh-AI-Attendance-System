import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  isBaiduOcrConfigured,
  baiduOcrLines,
  matchRosterFromLines,
} from '@/lib/ocr-baidu'

const STAFF_ROLES = ['instructor', 'admin', 'super_admin']

interface RosterEntry {
  id: string
  name: string
}
type Mark = { student_id: string; name: string; present: boolean }

// Primary OCR: OpenAI vision reasons about ticks/marks per roster row.
async function readWithOpenAI(roster: RosterEntry[], image: string): Promise<Mark[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You read photos of physical class attendance registers. You are given the exact list of enrolled students (with ids). For each student, decide if they are marked PRESENT in the register image — a tick/check, the letter "P", "present", or a signature next to their name means present; a cross, "A", "absent", or a blank means not present. Match register names to the provided names even with spelling/handwriting differences. Respond ONLY with JSON: {"marks":[{"id":"<student id>","present":true|false}]}. Use only the provided ids. Include every provided student exactly once.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Enrolled students (JSON): ${JSON.stringify(roster)}. Read the attached register photo and return the marks JSON.`,
          },
          { type: 'image_url', image_url: { url: image, detail: 'high' } },
        ],
      },
    ],
  })

  let marks: Array<{ id: string; present: boolean }> = []
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
  if (Array.isArray(parsed.marks)) marks = parsed.marks
  const presentById = new Map(marks.map((m) => [m.id, Boolean(m.present)]))
  return roster.map((s) => ({
    student_id: s.id,
    name: s.name,
    present: presentById.get(s.id) ?? false,
  }))
}

// Read a photo of a physical attendance register and decide, for each enrolled
// student in the session's batch, whether they are marked present. Returns a
// preview for the teacher to review — it does NOT write attendance.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    if (!roles?.some((r) => STAFF_ROLES.includes(r.role))) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403 }
      )
    }

    if (!process.env.OPENAI_API_KEY && !isBaiduOcrConfigured()) {
      return NextResponse.json(
        { success: false, error: { code: 'OCR_DISABLED', message: 'OCR is not configured on the server.' } },
        { status: 503 }
      )
    }

    const body = await request.json()
    const sessionId: string | undefined = body?.session_id
    const image: string | undefined = body?.image // data URL (base64)
    if (!sessionId || !image?.startsWith('data:image/')) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'session_id and an image are required' } },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: session } = await service
      .from('sessions')
      .select('id, batch_id, session_date')
      .eq('id', sessionId)
      .single()
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } },
        { status: 404 }
      )
    }

    const { data: students } = await service
      .from('student_profiles')
      .select('id, full_name')
      .eq('batch_id', session.batch_id)
      .eq('status', 'active')
      .order('full_name')

    const roster = (students ?? []).map((s) => ({ id: s.id, name: s.full_name }))
    if (roster.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_STUDENTS', message: 'No active students in this batch' } },
        { status: 400 }
      )
    }

    // Try the free OCR (Baidu) first. If it reads enough of the roster, use it.
    // Otherwise escalate to OpenAI vision (paid) for a better read.
    let results: Mark[] | null = null
    let source: 'baidu' | 'openai' | null = null
    let baiduFallback: Mark[] | null = null // weak Baidu result kept as last resort

    if (isBaiduOcrConfigured()) {
      try {
        const lines = await baiduOcrLines(image)
        if (lines && lines.length > 0) {
          const matched = matchRosterFromLines(roster, lines)
          const rate = matched.filter((m) => m.matched).length / matched.length
          const stripped: Mark[] = matched.map((m) => ({
            student_id: m.student_id,
            name: m.name,
            present: m.present,
          }))
          if (rate >= 0.5) {
            results = stripped
            source = 'baidu'
          } else {
            baiduFallback = stripped
          }
        }
      } catch (err) {
        console.error('Baidu OCR failed:', err)
      }
    }

    // Escalate to OpenAI when the free read was missing or unsatisfactory.
    if (!results && process.env.OPENAI_API_KEY) {
      try {
        results = await readWithOpenAI(roster, image)
        source = 'openai'
      } catch (err) {
        console.error('OpenAI OCR failed:', err)
      }
    }

    // Last resort: a weak Baidu read is still better than nothing (teacher reviews).
    if (!results && baiduFallback) {
      results = baiduFallback
      source = 'baidu'
    }

    if (!results) {
      return NextResponse.json(
        { success: false, error: { code: 'OCR_FAILED', message: 'Could not read the register. Please retake the photo.' } },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        session_id: sessionId,
        results,
        source,
        present_count: results.filter((r) => r.present).length,
        total: results.length,
      },
    })
  } catch (error) {
    console.error('OCR attendance error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to read the register' } },
      { status: 500 }
    )
  }
}
