// Attendance heatmap & distribution analytics.
//
// Pure aggregation helpers that turn a flat list of attendance records into the
// grids the admin analytics dashboard renders. All functions are side-effect
// free so they can run on the server (API route) or be unit tested directly.

export type AttendanceOutcome = 'present' | 'absent' | 'late'

export interface AnalyticsRecord {
  student_id: string
  student_name?: string
  session_date: string // ISO date (YYYY-MM-DD) or full timestamp
  outcome: AttendanceOutcome
  batch_id?: string | null
  batch_name?: string | null
  course_id?: string | null
  course_name?: string | null
  instructor_id?: string | null
  instructor_name?: string | null
  /** Hour of day (0-23) the attendance window opened, when known. */
  hour?: number | null
}

export interface HeatCell {
  key: string
  label: string
  present: number
  total: number
  rate: number // 0-100
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function rate(present: number, total: number): number {
  return total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0
}

function isPresent(o: AttendanceOutcome): boolean {
  return o === 'present' || o === 'late'
}

function bucket(
  records: AnalyticsRecord[],
  keyFn: (r: AnalyticsRecord) => { key: string; label: string } | null,
): HeatCell[] {
  const map = new Map<string, HeatCell>()
  for (const r of records) {
    const k = keyFn(r)
    if (!k) continue
    const cell = map.get(k.key) ?? { key: k.key, label: k.label, present: 0, total: 0, rate: 0 }
    cell.total += 1
    if (isPresent(r.outcome)) cell.present += 1
    map.set(k.key, cell)
  }
  const cells = Array.from(map.values())
  for (const c of cells) c.rate = rate(c.present, c.total)
  return cells
}

/** Day-of-week distribution (Mon–Sun). */
export function dayOfWeekDistribution(records: AnalyticsRecord[]): HeatCell[] {
  const cells = bucket(records, (r) => {
    const d = new Date(r.session_date)
    if (isNaN(d.getTime())) return null
    const dow = d.getUTCDay()
    return { key: String(dow), label: DAY_LABELS[dow] }
  })
  return cells.sort((a, b) => Number(a.key) - Number(b.key))
}

/** Time-slot analysis grouped into morning / afternoon / evening buckets. */
export function timeSlotDistribution(records: AnalyticsRecord[]): HeatCell[] {
  const slots: Array<{ key: string; label: string; from: number; to: number }> = [
    { key: 'early', label: 'Before 9 AM', from: 0, to: 9 },
    { key: 'morning', label: '9 AM – 12 PM', from: 9, to: 12 },
    { key: 'afternoon', label: '12 – 3 PM', from: 12, to: 15 },
    { key: 'late_afternoon', label: '3 – 6 PM', from: 15, to: 18 },
    { key: 'evening', label: '6 PM onward', from: 18, to: 24 },
  ]
  return bucket(records, (r) => {
    const h = r.hour
    if (h == null || isNaN(h)) return null
    const slot = slots.find((s) => h >= s.from && h < s.to)
    return slot ? { key: slot.key, label: slot.label } : null
  }).sort((a, b) => slots.findIndex((s) => s.key === a.key) - slots.findIndex((s) => s.key === b.key))
}

/** Weekly heatmap: rows = ISO week (YYYY-Www), used for trend over time. */
export function weeklyHeatmap(records: AnalyticsRecord[]): HeatCell[] {
  return bucket(records, (r) => {
    const d = new Date(r.session_date)
    if (isNaN(d.getTime())) return null
    const { year, week } = isoWeek(d)
    const key = `${year}-W${String(week).padStart(2, '0')}`
    return { key, label: key }
  }).sort((a, b) => a.key.localeCompare(b.key))
}

/** Monthly heatmap: rows = YYYY-MM. */
export function monthlyHeatmap(records: AnalyticsRecord[]): HeatCell[] {
  return bucket(records, (r) => {
    const d = new Date(r.session_date)
    if (isNaN(d.getTime())) return null
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    return { key, label }
  }).sort((a, b) => a.key.localeCompare(b.key))
}

/** Subject (course) wise attendance rate. */
export function subjectHeatmap(records: AnalyticsRecord[]): HeatCell[] {
  return bucket(records, (r) =>
    r.course_id ? { key: r.course_id, label: r.course_name || 'Untitled course' } : null,
  ).sort((a, b) => b.rate - a.rate)
}

/** Faculty (instructor) wise attendance trend. */
export function facultyHeatmap(records: AnalyticsRecord[]): HeatCell[] {
  return bucket(records, (r) =>
    r.instructor_id ? { key: r.instructor_id, label: r.instructor_name || 'Unassigned' } : null,
  ).sort((a, b) => b.rate - a.rate)
}

export interface RankedClass {
  batch_id: string
  batch_name: string
  present: number
  total: number
  rate: number
}

/** Most punctual classes (batches), ranked by attendance rate. */
export function classRanking(records: AnalyticsRecord[]): RankedClass[] {
  const cells = bucket(records, (r) =>
    r.batch_id ? { key: r.batch_id, label: r.batch_name || 'Batch' } : null,
  )
  return cells
    .map((c) => ({ batch_id: c.key, batch_name: c.label, present: c.present, total: c.total, rate: c.rate }))
    .sort((a, b) => b.rate - a.rate)
}

export interface AbsentStudent {
  student_id: string
  student_name: string
  absences: number
  total: number
  rate: number
}

/** Most absent students, ranked by number of absences. */
export function mostAbsentStudents(records: AnalyticsRecord[], limit = 10): AbsentStudent[] {
  const map = new Map<string, AbsentStudent>()
  for (const r of records) {
    const cur = map.get(r.student_id) ?? {
      student_id: r.student_id,
      student_name: r.student_name || 'Student',
      absences: 0,
      total: 0,
      rate: 0,
    }
    cur.total += 1
    if (!isPresent(r.outcome)) cur.absences += 1
    map.set(r.student_id, cur)
  }
  const arr = Array.from(map.values())
  for (const s of arr) s.rate = rate(s.total - s.absences, s.total)
  return arr.sort((a, b) => b.absences - a.absences).slice(0, limit)
}

// --- ISO week helper -------------------------------------------------------
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}
