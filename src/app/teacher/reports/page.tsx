'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import type { Batch } from '@/types/database'

interface StudentSummary {
  name: string
  attendance: number
  present: number
  absent: number
  total: number
}

interface SessionTrend {
  date: string
  attendance_rate: number
}

export default function TeacherReportsPage() {
  const supabase = createClient()
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState('')
  const [studentSummary, setStudentSummary] = useState<StudentSummary[]>([])
  const [sessionTrend, setSessionTrend] = useState<SessionTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  const fetchBatches = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'active')
      .order('name')

    setBatches((data as Batch[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  useEffect(() => {
    if (!selectedBatch) return

    async function fetchReport() {
      setLoadingReport(true)

      const { data: students } = await supabase
        .from('student_profiles')
        .select('full_name, attendance_percentage, present_count, absent_count, total_sessions')
        .eq('batch_id', selectedBatch)
        .eq('status', 'active')
        .order('full_name')

      setStudentSummary(
        (students ?? []).map(s => ({
          name: s.full_name.length > 15 ? s.full_name.slice(0, 15) + '...' : s.full_name,
          attendance: s.attendance_percentage ?? 0,
          present: s.present_count ?? 0,
          absent: s.absent_count ?? 0,
          total: s.total_sessions ?? 0,
        }))
      )

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, session_date')
        .eq('batch_id', selectedBatch)
        .in('status', ['completed', 'attendance_closed'])
        .order('session_date', { ascending: true })
        .limit(20)

      if (sessions && sessions.length > 0) {
        const trendData: SessionTrend[] = []
        for (const session of sessions) {
          const { count: approved } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('status', 'approved')

          const { count: total } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)

          const rate = total && total > 0 ? Math.round(((approved ?? 0) / total) * 100) : 0
          trendData.push({
            date: new Date(session.session_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
            attendance_rate: rate,
          })
        }
        setSessionTrend(trendData)
      } else {
        setSessionTrend([])
      }

      setLoadingReport(false)
    }

    fetchReport()
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <Skeleton className="h-96" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">View attendance reports and student performance</p>
      </div>

      <Select
        label="Select Batch"
        value={selectedBatch}
        onChange={(e) => setSelectedBatch(e.target.value)}
      >
        <option value="">Select a batch</option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </Select>

      {!selectedBatch && (
        <EmptyState
          icon={BarChart3}
          title="Select a batch"
          description="Choose a batch to view its attendance reports."
        />
      )}

      {selectedBatch && loadingReport && (
        <div className="space-y-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      )}

      {selectedBatch && !loadingReport && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Session Attendance Rate</CardTitle>
            </CardHeader>
            <CardContent>
              {sessionTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sessionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Attendance Rate']}
                      contentStyle={{
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '12px',
                      }}
                    />
                    <Line type="monotone" dataKey="attendance_rate" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-gray-400">No completed sessions yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Student Attendance Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {studentSummary.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, studentSummary.length * 35)}>
                  <BarChart data={studentSummary} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Attendance']}
                      contentStyle={{
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '12px',
                      }}
                    />
                    <Bar dataKey="attendance" radius={[0, 6, 6, 0]}>
                      {studentSummary.map((s, i) => {
                        const fill = s.attendance >= 75 ? '#10b981' : s.attendance >= 50 ? '#f59e0b' : '#ef4444'
                        return <rect key={i} fill={fill} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-gray-400">No student data</p>
              )}
            </CardContent>
          </Card>

          {studentSummary.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>At-Risk Students</CardTitle>
              </CardHeader>
              <CardContent>
                {studentSummary.filter(s => s.attendance < 75).length === 0 ? (
                  <p className="py-4 text-center text-sm text-emerald-600">All students are above the 75% attendance threshold</p>
                ) : (
                  <div className="space-y-2">
                    {studentSummary
                      .filter(s => s.attendance < 75)
                      .sort((a, b) => a.attendance - b.attendance)
                      .map((s) => (
                        <div key={s.name} className="flex items-center justify-between rounded-xl glass-subtle px-4 py-3">
                          <span className="text-sm font-medium text-gray-900">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{s.present}/{s.total} sessions</span>
                            <Badge variant={s.attendance < 50 ? 'destructive' : 'warning'}>
                              {s.attendance}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
