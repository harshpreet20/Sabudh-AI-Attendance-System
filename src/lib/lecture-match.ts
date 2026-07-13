// Pure, testable heuristics for matching an uploaded file to a lecture. Used by
// the suggest-lecture route before it falls back to an AI call. Keeping this
// free of framework/db imports makes it unit-testable and dependency-light.

export interface LectureCandidate { id: string; number: number; topic: string }
export interface HeuristicMatch { session_id: string; confidence: 'high' | 'medium'; via: 'heuristic' }

const STOP = new Set(['the', 'and', 'for', 'with', 'intro', 'introduction', 'to', 'of', 'a', 'an', 'lecture', 'class', 'session', 'notes', 'slides', 'ppt', 'pptx', 'pdf', 'doc', 'docx', 'part', 'final', 'copy', 'v1', 'v2'])

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t))
}

// Pull an explicit lecture/week/day number out of a filename, e.g.
// "Lecture 03", "L2", "week-5", "class 7", "session2".
export function explicitNumber(name: string): number | null {
  // (?!\d) instead of \b so we stop at the end of the number even when the next
  // char is an underscore (a regex word char), e.g. "L2_intro" / "week3_notes".
  const m = name.toLowerCase().match(/(?:lecture|lec|class|week|day|session|unit|module|chapter|ch|[lw])\s*[-_# ]?\s*(\d{1,2})(?!\d)/)
  return m ? parseInt(m[1], 10) : null
}

// Try to match a filename to a candidate lecture without any AI. Returns null
// when nothing is confident enough (the caller then falls back to AI).
export function heuristicMatch(fileName: string, candidates: LectureCandidate[]): HeuristicMatch | null {
  // 1) Explicit number in the filename wins.
  const n = explicitNumber(fileName)
  if (n !== null) {
    const hit = candidates.find((c) => c.number === n)
    if (hit) return { session_id: hit.id, confidence: 'high', via: 'heuristic' }
  }

  // 2) Filename <-> topic word overlap.
  const fileTokens = new Set(tokens(fileName))
  if (fileTokens.size === 0) return null

  let best: LectureCandidate | null = null, bestScore = 0, second = 0
  for (const c of candidates) {
    if (!c.topic) continue
    const tt = tokens(c.topic)
    if (tt.length === 0) continue
    const overlap = tt.filter((t) => fileTokens.has(t)).length
    const score = overlap / Math.max(2, tt.length)
    if (score > bestScore) { second = bestScore; bestScore = score; best = c }
    else if (score > second) { second = score }
  }
  // Confident only when strong and clearly ahead of the runner-up.
  if (best && bestScore >= 0.5 && bestScore - second >= 0.25) {
    return { session_id: best.id, confidence: 'medium', via: 'heuristic' }
  }
  return null
}
