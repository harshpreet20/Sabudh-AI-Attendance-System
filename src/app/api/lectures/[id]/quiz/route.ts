import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { gradeQuiz } from '@/lib/lectures'

// Submit a practice-quiz attempt. Grades server-side against the cached quiz so
// answers can't be inferred client-side, records the attempt, and returns the
// per-question results + explanations.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const body = await request.json()
    const answers: Record<string, string> = body.answers && typeof body.answers === 'object' ? body.answers : {}
    const difficulty = ['easy', 'standard', 'hard'].includes(body.difficulty) ? body.difficulty : 'standard'

    const { data: quizRow } = await service
      .from('lecture_ai_content')
      .select('payload')
      .eq('session_id', id)
      .eq('kind', 'quiz')
      .eq('difficulty', difficulty)
      .maybeSingle()

    if (!quizRow) {
      return NextResponse.json({ success: false, error: { code: 'NO_QUIZ', message: 'No quiz generated yet.' } }, { status: 400 })
    }

    const quiz = quizRow.payload as { questions?: Array<{ id: string; type: string; answer: string; explanation?: string }> }
    const { score, total, results } = gradeQuiz(quiz, answers)

    await service.from('lecture_quiz_attempts').insert({ session_id: id, user_id: user.id, answers, score, total })

    // Return correct answers + explanations only after submission.
    const review = (quiz.questions || []).map((q) => ({
      id: q.id,
      correct: results[q.id] === true,
      answer: q.answer,
      explanation: q.explanation || '',
    }))

    return NextResponse.json({ success: true, data: { score, total, results, review } })
  } catch (error) {
    console.error('[lectures/:id/quiz] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
