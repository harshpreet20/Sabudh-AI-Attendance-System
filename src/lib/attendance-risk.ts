// Attendance risk detection & insight engine.
//
// Pure, dependency-free scoring functions shared by the risk-detection API,
// the AI-insights API and the at-risk dashboard widget. Keeping the maths here
// (rather than inline in a route) makes the thresholds testable and consistent
// across every surface that reports risk.

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface StudentAttendanceStats {
  student_id: string
  full_name: string
  batch_id: string | null
  attendance_percentage: number
  present_count: number
  absent_count: number
  late_count: number
  total_sessions: number
  /** Ordered most-recent-first list of statuses ('present' | 'absent' | 'late'). */
  recent_statuses?: Array<'present' | 'absent' | 'late'>
}

export interface RiskContext {
  /** Threshold the student must finish at (e.g. 75). */
  thresholdPct: number
  /** Total sessions planned for the batch (used to project the final %). */
  totalPlannedSessions: number
}

export interface RiskAssessment {
  student_id: string
  full_name: string
  batch_id: string | null
  risk_level: RiskLevel
  risk_score: number
  current_pct: number
  projected_pct: number
  threshold_pct: number
  consecutive_absences: number
  factors: string[]
  recommendation: string
}

/** Count the leading run of absences in a most-recent-first status list. */
export function consecutiveAbsences(recent: Array<'present' | 'absent' | 'late'> = []): number {
  let count = 0
  for (const s of recent) {
    if (s === 'absent') count++
    else break
  }
  return count
}

/**
 * Project the student's final attendance percentage assuming they attend every
 * remaining session in the batch. If the projection still falls below the
 * threshold, the shortfall is effectively unrecoverable.
 */
export function projectedFinalPct(stats: StudentAttendanceStats, ctx: RiskContext): number {
  const planned = Math.max(ctx.totalPlannedSessions, stats.total_sessions)
  if (planned <= 0) return stats.attendance_percentage
  const remaining = Math.max(0, planned - stats.total_sessions)
  const bestCasePresent = stats.present_count + remaining
  return Math.min(100, (bestCasePresent / planned) * 100)
}

export function assessStudent(stats: StudentAttendanceStats, ctx: RiskContext): RiskAssessment {
  const current = Number(stats.attendance_percentage) || 0
  const projected = projectedFinalPct(stats, ctx)
  const consec = consecutiveAbsences(stats.recent_statuses)
  const threshold = ctx.thresholdPct

  const factors: string[] = []
  let score = 0

  // 1. How far below threshold the student currently sits.
  if (stats.total_sessions > 0 && current < threshold) {
    const gap = threshold - current
    score += Math.min(40, gap * 1.2)
    factors.push(`Currently ${current.toFixed(1)}% — ${gap.toFixed(1)} points below the ${threshold}% requirement`)
  }

  // 2. Whether the shortfall is still mathematically recoverable.
  if (stats.total_sessions > 0 && projected < threshold) {
    score += 35
    factors.push(`Even with perfect attendance, projected to finish at ${projected.toFixed(1)}%`)
  } else if (projected < threshold + 5) {
    score += 12
    factors.push(`Little margin — projected final attendance is ${projected.toFixed(1)}%`)
  }

  // 3. Consecutive absences signal disengagement.
  if (consec >= 3) {
    score += 20
    factors.push(`${consec} consecutive absences`)
  } else if (consec === 2) {
    score += 10
    factors.push('2 consecutive absences')
  }

  // 4. Overall absence ratio.
  if (stats.total_sessions >= 4) {
    const absentRatio = stats.absent_count / stats.total_sessions
    if (absentRatio >= 0.4) {
      score += 15
      factors.push(`Missed ${(absentRatio * 100).toFixed(0)}% of sessions so far`)
    }
  }

  // 5. Chronic lateness.
  if (stats.late_count >= 3) {
    score += 5
    factors.push(`Late ${stats.late_count} times`)
  }

  score = Math.min(100, Math.round(score))

  const level: RiskLevel =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'

  return {
    student_id: stats.student_id,
    full_name: stats.full_name,
    batch_id: stats.batch_id,
    risk_level: level,
    risk_score: score,
    current_pct: Number(current.toFixed(2)),
    projected_pct: Number(projected.toFixed(2)),
    threshold_pct: threshold,
    consecutive_absences: consec,
    factors,
    recommendation: recommendationFor(level, projected, threshold, consec),
  }
}

function recommendationFor(
  level: RiskLevel,
  projected: number,
  threshold: number,
  consec: number,
): string {
  if (level === 'critical') {
    if (projected < threshold) {
      return 'Unrecoverable shortfall — escalate to a counsellor and discuss a formal attendance-recovery or re-enrolment plan.'
    }
    return 'Immediate 1:1 intervention required. Contact the student today and confirm they can attend all remaining sessions.'
  }
  if (level === 'high') {
    if (consec >= 3) {
      return 'Reach out about the consecutive absences — check for personal or logistical blockers and offer support.'
    }
    return 'Schedule a check-in this week and send a low-attendance warning outlining exactly how many sessions are still needed.'
  }
  if (level === 'medium') {
    return 'Send an automated low-attendance reminder and monitor over the next two sessions.'
  }
  return 'On track — no action needed.'
}

export function assessAll(students: StudentAttendanceStats[], ctxByBatch: Map<string, RiskContext>, fallback: RiskContext): RiskAssessment[] {
  return students.map((s) => assessStudent(s, (s.batch_id && ctxByBatch.get(s.batch_id)) || fallback))
}
