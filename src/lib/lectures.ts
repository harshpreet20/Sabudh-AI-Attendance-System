import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'

// Shared helpers for the Previous Class Workspace: extract text from lecture
// materials and generate AI learning content (summary / takeaways / quiz).

export interface MaterialRow {
  id: string
  bucket: string | null
  storage_path: string | null
  file_type: string | null
  file_name: string | null
  extracted_text: string | null
}

const TEXT_LIMIT = 14000

function isPdf(m: MaterialRow): boolean {
  return /pdf/i.test(m.file_type || '') || /\.pdf$/i.test(m.file_name || '')
}
function isPlainText(m: MaterialRow): boolean {
  return /(text|markdown|md|txt|plain)/i.test(m.file_type || '') || /\.(txt|md|markdown)$/i.test(m.file_name || '')
}

async function downloadBytes(service: SupabaseClient, m: MaterialRow): Promise<ArrayBuffer | null> {
  if (!m.storage_path) return null
  const bucket = m.bucket || 'uploads'
  const { data, error } = await service.storage.from(bucket).download(m.storage_path)
  if (error || !data) return null
  return await data.arrayBuffer()
}

async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  // pdfjs text extraction needs no canvas; disable the worker for Node.
  const pdfjs = (await import('pdfjs-dist')) as unknown as {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (opts: unknown) => { promise: Promise<PdfDoc> }
  }
  pdfjs.GlobalWorkerOptions.workerSrc = ''
  const doc = await pdfjs.getDocument({ data: buf, useWorkerFetch: false, useSystemFonts: true, isEvalSupported: false }).promise
  let text = ''
  const maxPages = Math.min(doc.numPages, 80)
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n\n'
    if (text.length > TEXT_LIMIT * 2) break
  }
  return text
}

interface PdfDoc {
  numPages: number
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>
}

// Extract (and cache) the text of a single material.
export async function extractMaterialText(service: SupabaseClient, m: MaterialRow): Promise<string> {
  if (m.extracted_text && m.extracted_text.length > 0) return m.extracted_text
  let text = ''
  try {
    const buf = await downloadBytes(service, m)
    if (buf) {
      if (isPdf(m)) text = await extractPdfText(buf)
      else if (isPlainText(m)) text = new TextDecoder().decode(buf)
    }
  } catch (err) {
    console.error('[lectures] extract failed for', m.id, err instanceof Error ? err.message : err)
  }
  text = text.trim()
  if (text) {
    await service.from('course_materials').update({ extracted_text: text.slice(0, 60000) }).eq('id', m.id)
  }
  return text
}

// Build a combined context string for a lecture from its materials, topic and
// teacher notes — the raw material for AI generation.
export async function gatherLectureContext(
  service: SupabaseClient,
  sessionId: string,
): Promise<{ context: string; sources: number }> {
  const { data: materials } = await service
    .from('course_materials')
    .select('id, bucket, storage_path, file_type, file_name, extracted_text, title')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })

  const { data: session } = await service
    .from('sessions')
    .select('topic_taught, next_topic, notes')
    .eq('id', sessionId)
    .maybeSingle()

  const { data: notes } = await service
    .from('lecture_notes')
    .select('content')
    .eq('session_id', sessionId)
    .maybeSingle()

  const parts: string[] = []
  if (session?.topic_taught) parts.push(`Lecture topic: ${session.topic_taught}`)
  if (session?.notes) parts.push(`Session notes: ${session.notes}`)
  if (notes?.content) parts.push(`Teacher notes:\n${notes.content}`)

  let sources = 0
  for (const m of materials || []) {
    const text = await extractMaterialText(service, m as MaterialRow)
    if (text) {
      sources++
      parts.push(`--- Material: ${(m as { title?: string }).title || m.file_name} ---\n${text}`)
    }
    if (parts.join('\n\n').length > TEXT_LIMIT) break
  }

  return { context: parts.join('\n\n').slice(0, TEXT_LIMIT), sources }
}

const DIFFICULTY_HINT: Record<string, string> = {
  easy: 'Explain simply, as if to a beginner. Short sentences, plain language.',
  standard: 'Pitch at a typical enrolled student level.',
  hard: 'Go deep and rigorous, suitable for advanced revision and exam prep.',
}

async function askJson(openai: OpenAI, prompt: string, maxTokens = 900): Promise<unknown | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    })
    const raw = completion.choices[0]?.message?.content?.trim() || ''
    return JSON.parse(raw)
  } catch (err) {
    console.error('[lectures] AI json failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function generateSummary(openai: OpenAI, context: string, difficulty: string): Promise<unknown> {
  return askJson(
    openai,
    `You are a study assistant. From the lecture material below, produce revision content. ${DIFFICULTY_HINT[difficulty] || ''}
Return JSON with keys: "summary" (2-3 paragraph markdown string), "key_concepts" (string[]), "definitions" (array of {term, definition}), "important_questions" (string[]), "revision_notes" (string[]), "suggested_reading" (string[]), "related_topics" (string[]).

LECTURE MATERIAL:
${context}`,
    1100,
  )
}

export async function generateTakeaways(openai: OpenAI, context: string, difficulty: string): Promise<unknown> {
  return askJson(
    openai,
    `From the lecture material below, extract the key takeaways. ${DIFFICULTY_HINT[difficulty] || ''}
Return JSON with keys: "objectives" (string[]), "concepts" (string[]), "formulas" (string[]), "definitions" (array of {term, definition}), "checklist" (string[] — a revision checklist).

LECTURE MATERIAL:
${context}`,
    900,
  )
}

export async function generateQuiz(openai: OpenAI, context: string, difficulty: string): Promise<unknown> {
  return askJson(
    openai,
    `Create a practice quiz from the lecture material below. ${DIFFICULTY_HINT[difficulty] || ''}
Return JSON: {"questions": [ {"id": "q1", "type": "mcq"|"true_false"|"fill_blank", "question": "...", "options": ["A","B","C","D"] (mcq only), "answer": "the correct option text / true|false / the exact blank answer", "explanation": "why", "topic": "the section/topic this question tests"} ] }.
Make 6-10 questions, mixed types, each with a clear single correct answer for auto-grading.
IMPORTANT: cover EVERY major topic/section of the material — distribute the questions across the whole lecture so no key topic is missed, and set each question's "topic" field accordingly.

LECTURE MATERIAL:
${context}`,
    1400,
  )
}

// Auto-grade a submitted attempt against a cached quiz payload.
export function gradeQuiz(
  quiz: { questions?: Array<{ id: string; type: string; answer: string }> },
  answers: Record<string, string>,
): { score: number; total: number; results: Record<string, boolean> } {
  const questions = quiz.questions || []
  const results: Record<string, boolean> = {}
  let score = 0
  for (const q of questions) {
    const given = (answers[q.id] ?? '').toString().trim().toLowerCase()
    const correct = (q.answer ?? '').toString().trim().toLowerCase()
    const ok = given.length > 0 && (given === correct || (q.type === 'fill_blank' && correct.includes(given) && given.length > 2))
    results[q.id] = ok
    if (ok) score++
  }
  return { score, total: questions.length, results }
}
