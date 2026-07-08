'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldAlert, ArrowRight, Bell } from 'lucide-react'

interface RiskAssessment {
  student_id: string
  full_name: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  risk_score: number
  current_pct: number
  projected_pct: number
  consecutive_absences: number
  recommendation: string
}

interface RiskData {
  summary: { total: number; critical: number; high: number; medium: number }
  assessments: RiskAssessment[]
}

function badge(level: string): 'destructive' | 'warning' | 'secondary' {
  if (level === 'critical' || level === 'high') return 'destructive'
  if (level === 'medium') return 'warning'
  return 'secondary'
}

// Dashboard widget (feature 9): surfaces the students who need immediate
// attention with at-a-glance risk counts and quick "notify" actions.
export function AtRiskWidget() {
  const [data, setData] = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notified, setNotified] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/risk')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function notify(a: RiskAssessment) {
    setNotified((prev) => new Set(prev).add(a.student_id))
    await fetch('/api/admin/notify-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: a.student_id,
        title: 'Low attendance warning',
        message: `Your attendance is ${a.current_pct}%. Please attend upcoming sessions to stay eligible.`,
        type: 'low_attendance',
      }),
    }).catch(() => {})
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const top = data.assessments.slice(0, 6)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            At-Risk Students
          </span>
          <Link href="/admin/insights" className="text-sm text-indigo-600 flex items-center gap-1 hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-red-50/60 p-3 text-center">
            <p className="text-xs text-gray-500">Critical</p>
            <p className="text-xl font-bold text-red-600">{data.summary.critical}</p>
          </div>
          <div className="rounded-lg bg-orange-50/60 p-3 text-center">
            <p className="text-xs text-gray-500">High</p>
            <p className="text-xl font-bold text-orange-600">{data.summary.high}</p>
          </div>
          <div className="rounded-lg bg-amber-50/60 p-3 text-center">
            <p className="text-xs text-gray-500">Medium</p>
            <p className="text-xl font-bold text-amber-600">{data.summary.medium}</p>
          </div>
        </div>

        {top.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No at-risk students — everyone is on track.</p>
        ) : (
          <div className="space-y-2">
            {top.map((a) => (
              <div key={a.student_id} className="flex items-center justify-between gap-2 text-sm border-b border-white/20 pb-2 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{a.full_name}</span>
                    <Badge variant={badge(a.risk_level)}>{a.risk_level}</Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {a.current_pct}% now · {a.projected_pct}% projected
                    {a.consecutive_absences > 0 && ` · ${a.consecutive_absences} in a row`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={notified.has(a.student_id)}
                  onClick={() => notify(a)}
                >
                  <Bell className="h-3.5 w-3.5 mr-1" />
                  {notified.has(a.student_id) ? 'Notified' : 'Notify'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
