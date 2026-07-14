import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { gradeQuiz } from '@/lib/lectures'

const SECONDS_PER_Q: Record<string, number> = { easy: 40, standard: 60, hard: 80 }

interface QuizQ { id: string; type: string; question: string; options?: string[]; answer: string; explanation?: string; topic?: string }

async function loadQuiz(service: ReturnType<typeof createServiceClient>, sessionId: string, difficulty: string) {
  const { data } = await service
    .from('lecture_ai_content')
    .select('payload')
    .eq('session_id', sessionId).eq('kind', 'quiz').eq('difficulty', difficulty)
    .maybeSingle()
  return (data?.payload as { questions?: QuizQ[] } | undefined)?.questions || null
}

// GET: the student's own attempt history + best; staff also get the class roster.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const { data: mine } = await service
      .from('quiz_assessments')
      .select('id, difficulty, score, total, status, flags, started_at, submitted_at')
      .eq('session_id', id).eq('user_id', user.id)
      .order('started_at', { ascending: false }).limit(20)

    let roster: unknown[] = []
    if (access.isStaff) {
      const { data: all } = await service
        .from('quiz_assessments')
        .select('id, user_id, student_id, difficulty, score, total, status, flags, submitted_at')
        .eq('session_id', id)
        .in('status', ['submitted', 'auto_submitted'])
        .order('submitted_at', { ascending: false }).limit(500)
      const ids = Array.from(new Set((all || []).map((a) => a.student_id).filter(Boolean))) as string[]
      const { data: profs } = ids.length
        ? await service.from('student_profiles').select('id, full_name').in('id', ids)
        : { data: [] as { id: string; full_name: string }[] }
      const nameById = new Map((profs || []).map((p) => [p.id, p.full_name]))
      // Best attempt per student.
      const best = new Map<string, { name: string; score: number; total: number; flags: number }>()
      for (const a of all || []) {
        const key = a.student_id || a.user_id
        const cur = best.get(key)
        const pct = a.total ? (a.score || 0) / a.total : 0
        const curPct = cur && cur.total ? cur.score / cur.total : -1
        if (!cur || pct > curPct) best.set(key, { name: nameById.get(a.student_id) || 'Student', score: a.score || 0, total: a.total, flags: a.flags })
      }
      roster = Array.from(best.values()).sort((x, y) => (y.score / (y.total || 1)) - (x.score / (x.total || 1)))
    }

    const attempts = mine || []
    const best = attempts.filter((a) => a.status !== 'in_progress').reduce((b, a) => (a.total && (a.score || 0) / a.total > b ? (a.score || 0) / a.total : b), 0)
    return NextResponse.json({ success: true, data: { attempts, best_pct: Math.round(best * 100), is_staff: access.isStaff, roster } })
  } catch (error) {
    console.error('[assessment] GET error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const action = body.action as 'start' | 'event' | 'submit'

    // --- START: create the timed attempt and deliver LOCKED questions -------
    if (action === 'start') {
      const difficulty = ['easy', 'standard', 'hard'].includes(body.difficulty) ? body.difficulty : 'standard'
      const questions = await loadQuiz(service, id, difficulty)
      if (!questions || questions.length === 0) {
        return NextResponse.json({ success: false, error: { code: 'NO_QUIZ', message: 'No quiz is ready for this lecture yet.' } }, { status: 400 })
      }
      const duration = questions.length * (SECONDS_PER_Q[difficulty] || 60)
      const { data: created, error } = await service.from('quiz_assessments').insert({
        session_id: id, user_id: user.id, student_id: access.studentProfileId,
        difficulty, total: questions.length, duration_seconds: duration,
        camera: !!body.camera, mic: !!body.mic,
      }).select('id, duration_seconds, total').single()
      if (error || !created) {
        return NextResponse.json({ success: false, error: { code: 'START_FAILED' } }, { status: 500 })
      }
      // Deliver questions WITHOUT answers/explanations — they stay server-side.
      const safe = questions.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options || undefined, topic: q.topic || undefined }))
      return NextResponse.json({ success: true, data: { assessment_id: created.id, duration_seconds: created.duration_seconds, total: created.total, questions: safe } })
    }

    // --- EVENT: record a proctoring flag ------------------------------------
    if (action === 'event') {
      const aid = body.assessment_id as string
      const eventType = String(body.event_type || 'other').slice(0, 40)
      const severity = ['low', 'medium', 'high'].includes(body.severity) ? body.severity : 'low'
      const { data: a } = await service.from('quiz_assessments').select('id, user_id, status').eq('id', aid).maybeSingle()
      if (!a || a.user_id !== user.id) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
      if (a.status === 'in_progress') {
        await service.from('quiz_proctor_events').insert({ assessment_id: aid, event_type: eventType, severity, details: body.details || {} })
        const { data: cur } = await service.from('quiz_assessments').select('flags').eq('id', aid).maybeSingle()
        await service.from('quiz_assessments').update({ flags: (cur?.flags || 0) + 1 }).eq('id', aid)
      }
      return NextResponse.json({ success: true })
    }

    // --- SUBMIT: grade + score ---------------------------------------------
    if (action === 'submit') {
      const aid = body.assessment_id as string
      const answers: Record<string, string> = body.answers && typeof body.answers === 'object' ? body.answers : {}
      const auto = !!body.auto
      const { data: a } = await service.from('quiz_assessments').select('id, user_id, difficulty, status').eq('id', aid).maybeSingle()
      if (!a || a.user_id !== user.id) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
      if (a.status !== 'in_progress') return NextResponse.json({ success: false, error: { code: 'ALREADY_SUBMITTED' } }, { status: 409 })

      const questions = await loadQuiz(service, id, a.difficulty)
      const quiz = { questions: questions || [] }
      const { score, total, results } = gradeQuiz(quiz as { questions: Array<{ id: string; type: string; answer: string }> }, answers)

      await service.from('quiz_assessments').update({
        score, total, status: auto ? 'auto_submitted' : 'submitted', submitted_at: new Date().toISOString(),
      }).eq('id', aid)
      // Keep the practice-attempt history consistent.
      await service.from('lecture_quiz_attempts').insert({ session_id: id, user_id: user.id, answers, score, total }).then(() => {}, () => {})

      const review = (questions || []).map((q) => ({ id: q.id, correct: results[q.id] === true, answer: q.answer, explanation: q.explanation || '', topic: q.topic || '' }))
      return NextResponse.json({ success: true, data: { score, total, results, review } })
    }

    return NextResponse.json({ success: false, error: { code: 'BAD_ACTION' } }, { status: 400 })
  } catch (error) {
    console.error('[assessment] POST error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
