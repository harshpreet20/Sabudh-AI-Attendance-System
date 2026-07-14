'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabPanel } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Sparkles,
  Flame,
  ShieldAlert,
  Copy,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  CalendarDays,
  Clock,
} from 'lucide-react'

interface HeatCell {
  key: string
  label: string
  present: number
  total: number
  rate: number
}

interface HeatmapData {
  total_records: number
  day_of_week: HeatCell[]
  time_slots: HeatCell[]
  weekly: HeatCell[]
  monthly: HeatCell[]
  subjects: HeatCell[]
  faculty: HeatCell[]
  class_ranking: Array<{ batch_id: string; batch_name: string; rate: number; present: number; total: number }>
  most_absent: Array<{ student_id: string; student_name: string; absences: number; total: number; rate: number }>
}

interface InsightsData {
  threshold: number
  summary: string
  ai_generated: boolean
  below_threshold: { count: number; students: Array<{ name: string; attendance: number }> }
  consecutive_absences: { count: number; students: Array<{ name: string; streak: number }> }
  subject_drops: Array<{ name: string; avg_present_per_session: number; sessions: number }>
  faculty_drops: Array<{ name: string; avg_present_per_session: number; sessions: number }>
}

interface RiskAssessment {
  student_id: string
  full_name: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  risk_score: number
  current_pct: number
  projected_pct: number
  threshold_pct: number
  consecutive_absences: number
  factors: string[]
  recommendation: string
}

interface RiskData {
  summary: { total: number; critical: number; high: number; medium: number; low: number }
  assessments: RiskAssessment[]
}

interface FlagRow {
  id: string
  student_name: string
  student_email: string
  flag_type: string
  severity: 'low' | 'medium' | 'high'
  details: Record<string, unknown>
  status: string
  created_at: string
}

const TABS = [
  { value: 'insights', label: 'AI Insights' },
  { value: 'heatmaps', label: 'Heatmaps' },
  { value: 'risk', label: 'At-Risk' },
  { value: 'duplicates', label: 'Duplicate Flags' },
]

function rateColor(rate: number): string {
  if (rate >= 85) return 'bg-emerald-500'
  if (rate >= 70) return 'bg-lime-500'
  if (rate >= 55) return 'bg-amber-500'
  if (rate >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function riskBadge(level: string): 'destructive' | 'warning' | 'secondary' {
  if (level === 'critical' || level === 'high') return 'destructive'
  if (level === 'medium') return 'warning'
  return 'secondary'
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('insights')
  const [loading, setLoading] = useState(true)
  const [heatmaps, setHeatmaps] = useState<HeatmapData | null>(null)
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [risk, setRisk] = useState<RiskData | null>(null)
  const [flags, setFlags] = useState<FlagRow[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [h, i, r, f] = await Promise.allSettled([
      fetch('/api/admin/analytics/heatmaps').then((res) => res.json()),
      fetch('/api/admin/insights').then((res) => res.json()),
      fetch('/api/admin/risk').then((res) => res.json()),
      fetch('/api/admin/duplicate-flags').then((res) => res.json()),
    ])
    if (h.status === 'fulfilled' && h.value.success) setHeatmaps(h.value.data)
    if (i.status === 'fulfilled' && i.value.success) setInsights(i.value.data)
    if (r.status === 'fulfilled' && r.value.success) setRisk(r.value.data)
    if (f.status === 'fulfilled' && f.value.success) setFlags(f.value.data.flags)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  async function resolveFlag(id: string, action: 'dismiss' | 'confirm') {
    await fetch('/api/admin/duplicate-flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag_id: id, action }),
    })
    setFlags((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-500" />
            Attendance Insights
          </h1>
          <p className="text-sm text-gray-500">AI-powered analytics, heatmaps, risk detection and anomaly review.</p>
        </div>
        <Button variant="secondary" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* AI INSIGHTS */}
      <TabPanel value="insights" activeTab={activeTab}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : insights ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  Executive Summary
                  <Badge variant={insights.ai_generated ? 'success' : 'secondary'}>
                    {insights.ai_generated ? 'AI generated' : 'Rule-based'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-line">{insights.summary}</p>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Below {insights.threshold}% Threshold ({insights.below_threshold.count})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.below_threshold.students.length === 0 && (
                    <p className="text-sm text-gray-500">No students below threshold.</p>
                  )}
                  {insights.below_threshold.students.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <span>{s.name}</span>
                      <Badge variant="destructive">{s.attendance}%</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Flame className="h-4 w-4 text-orange-500" />
                    Consecutive Absences ({insights.consecutive_absences.count})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.consecutive_absences.students.length === 0 && (
                    <p className="text-sm text-gray-500">No students with consecutive absences.</p>
                  )}
                  {insights.consecutive_absences.students.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <span>{s.name}</span>
                      <Badge variant="warning">{s.streak} in a row</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Lowest Subject Turnout
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.subject_drops.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <span>{s.name}</span>
                      <span className="text-gray-500">{s.avg_present_per_session}/session</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Lowest Faculty Turnout
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.faculty_drops.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <span>{s.name}</span>
                      <span className="text-gray-500">{s.avg_present_per_session}/session</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState title="No insights yet" description="Attendance data is needed to generate insights." icon={Sparkles} />
        )}
      </TabPanel>

      {/* HEATMAPS */}
      <TabPanel value="heatmaps" activeTab={activeTab}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : heatmaps && heatmaps.total_records > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <HeatRow title="Day of Week" icon={CalendarDays} cells={heatmaps.day_of_week} />
              <HeatRow title="Time Slot" icon={Clock} cells={heatmaps.time_slots} />
              <HeatRow title="Subject-wise" icon={Flame} cells={heatmaps.subjects} />
              <HeatRow title="Faculty-wise" icon={Flame} cells={heatmaps.faculty} />
            </div>
            <HeatRow title="Weekly Trend" icon={CalendarDays} cells={heatmaps.weekly} wide />
            <HeatRow title="Monthly Trend" icon={CalendarDays} cells={heatmaps.monthly} wide />

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most Punctual Classes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {heatmaps.class_ranking.slice(0, 8).map((c) => (
                    <div key={c.batch_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.batch_name}</span>
                      <Badge variant={c.rate >= 75 ? 'success' : 'warning'}>{c.rate}%</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most Absent Students</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {heatmaps.most_absent.map((s) => (
                    <div key={s.student_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.student_name}</span>
                      <Badge variant="destructive">{s.absences} absences</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState title="No attendance data" description="Once sessions have attendance, heatmaps appear here." icon={Flame} />
        )}
      </TabPanel>

      {/* RISK */}
      <TabPanel value="risk" activeTab={activeTab}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : risk ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Critical" value={risk.summary.critical} tone="red" />
              <StatTile label="High" value={risk.summary.high} tone="orange" />
              <StatTile label="Medium" value={risk.summary.medium} tone="amber" />
              <StatTile label="Total Assessed" value={risk.summary.total} tone="slate" />
            </div>
            <div className="space-y-3">
              {risk.assessments.length === 0 && (
                <EmptyState title="No at-risk students" description="Everyone is on track." icon={ShieldAlert} />
              )}
              {risk.assessments.map((a) => (
                <Card key={a.student_id}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{a.full_name}</span>
                          <Badge variant={riskBadge(a.risk_level)}>{a.risk_level.toUpperCase()}</Badge>
                          <span className="text-xs text-gray-500">score {a.risk_score}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Current {a.current_pct}% · Projected {a.projected_pct}% · Threshold {a.threshold_pct}%
                          {a.consecutive_absences > 0 && ` · ${a.consecutive_absences} consecutive absences`}
                        </p>
                        <ul className="mt-2 text-sm list-disc list-inside text-gray-600 space-y-0.5">
                          {a.factors.map((f, idx) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-sm text-indigo-600">
                          <strong>Recommended:</strong> {a.recommendation}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="No risk data" description="Risk assessment needs attendance history." icon={ShieldAlert} />
        )}
      </TabPanel>

      {/* DUPLICATE FLAGS */}
      <TabPanel value="duplicates" activeTab={activeTab}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : flags.length > 0 ? (
          <div className="space-y-3">
            {flags.map((f) => (
              <Card key={f.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4 text-amber-500" />
                        <span className="font-semibold">{f.student_name}</span>
                        <Badge variant={f.severity === 'high' ? 'destructive' : f.severity === 'medium' ? 'warning' : 'secondary'}>
                          {f.flag_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{f.student_email}</p>
                      <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{JSON.stringify(f.details)}</pre>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => resolveFlag(f.id, 'dismiss')}>
                        Dismiss
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => resolveFlag(f.id, 'confirm')}>
                        Confirm
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No open flags" description="No suspicious attendance attempts need review." icon={ShieldAlert} />
        )}
      </TabPanel>
    </div>
  )
}

function HeatRow({
  title,
  icon: Icon,
  cells,
  wide,
}: {
  title: string
  icon: typeof Flame
  cells: HeatCell[]
  wide?: boolean
}) {
  return (
    <Card className={wide ? 'md:col-span-2' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-indigo-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cells.length === 0 ? (
          <p className="text-sm text-gray-500">No data.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cells.map((c) => (
              <div key={c.key} className="flex flex-col items-center gap-1" title={`${c.present}/${c.total} present`}>
                <div
                  className={`h-12 w-12 rounded-lg flex items-center justify-center text-white text-xs font-semibold ${rateColor(c.rate)}`}
                  style={{ opacity: 0.55 + (c.rate / 100) * 0.45 }}
                >
                  {c.rate}%
                </div>
                <span className="text-[10px] text-gray-500 max-w-[64px] truncate text-center">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'red' | 'orange' | 'amber' | 'slate' }) {
  const toneMap = {
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    slate: 'text-slate-600',
  }
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${toneMap[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
