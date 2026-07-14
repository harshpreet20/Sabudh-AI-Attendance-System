// Word-level diff for the notes "track changes" mode. Produces a list of
// segments (equal / insert / delete) via an LCS, which the editor renders as
// tracked changes the user can accept or reject individually.

export type DiffType = 'equal' | 'insert' | 'delete'
export interface DiffOp { type: DiffType; text: string }

// Split into word and whitespace tokens so diffs land on word boundaries and
// spacing is preserved when segments are recombined.
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) || []
}

function push(ops: DiffOp[], type: DiffType, text: string) {
  const last = ops[ops.length - 1]
  if (last && last.type === type) last.text += text
  else ops.push({ type, text })
}

const MAX_TOKENS = 2500 // keep the O(n*m) DP bounded for very large notes

export function diffWords(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ type: 'equal', text: a }] : []
  const A = tokenize(a)
  const B = tokenize(b)
  const ops: DiffOp[] = []

  // Fallback for pathologically large inputs: treat as a full replacement.
  if (A.length > MAX_TOKENS || B.length > MAX_TOKENS) {
    if (a) ops.push({ type: 'delete', text: a })
    if (b) ops.push({ type: 'insert', text: b })
    return ops
  }

  const n = A.length, m = B.length
  // dp[i][j] = LCS length of A[i:], B[j:]
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { push(ops, 'equal', A[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push(ops, 'delete', A[i]); i++ }
    else { push(ops, 'insert', B[j]); j++ }
  }
  while (i < n) { push(ops, 'delete', A[i]); i++ }
  while (j < m) { push(ops, 'insert', B[j]); j++ }
  return ops
}

// Recombine a diff into final text given per-op decisions. An accepted insert is
// kept; a rejected insert is dropped. An accepted delete is removed; a rejected
// delete is kept (restores the original). Missing decisions default to accept,
// i.e. the edited version wins.
export function applyDecisions(ops: DiffOp[], decisions: Record<number, 'accept' | 'reject'>): string {
  let out = ''
  ops.forEach((op, idx) => {
    const d = decisions[idx] ?? 'accept'
    if (op.type === 'equal') out += op.text
    else if (op.type === 'insert') { if (d === 'accept') out += op.text }
    else if (op.type === 'delete') { if (d === 'reject') out += op.text }
  })
  return out
}
