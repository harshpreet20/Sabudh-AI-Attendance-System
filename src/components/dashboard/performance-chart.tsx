'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3 } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface PerformanceChartProps {
  studentId: string
  batchId: string | null
  presentCount: number
  absentCount: number
  lateCount: number
}

interface SessionPoint {
  date: string
  status: 'present' | 'absent' | 'late'
  cumulative: number
}

const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b']

export function PerformanceChart({
  studentId,
  batchId,
  presentCount,
  absentCount,
  lateCount,
}: PerformanceChartProps) {
  const [trendData, setTrendData] = useState<SessionPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTrend() {
      if (!batchId) {
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, session_date')
        .eq('batch_id', batchId)
        .in('status', ['completed', 'attendance_closed'])
        .order('session_date', { ascending: true })
        .limit(20)

      if (!sessions || sessions.length === 0) {
        setLoading(false)
        return
      }

      const points: SessionPoint[] = []
      let totalSessions = 0
      let approvedCount = 0

      for (const session of sessions) {
        totalSessions++

        const { data: att } = await supabase
          .from('attendance')
          .select('status')
          .eq('session_id', session.id)
          .eq('student_id', studentId)
          .single()

        const wasPresent = att?.status === 'approved'
        if (wasPresent) approvedCount++

        const cumPercentage = totalSessions > 0 ? Math.round((approvedCount / totalSessions) * 100) : 0

        points.push({
          date: new Date(session.session_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          status: wasPresent ? 'present' : att?.status === 'excused' ? 'late' : 'absent',
          cumulative: cumPercentage,
        })
      }

      setTrendData(points)
      setLoading(false)
    }

    fetchTrend()
  }, [studentId, batchId])

  const pieData = [
    { name: 'Present', value: presentCount },
    { name: 'Absent', value: absentCount },
    { name: 'Late', value: lateCount },
  ].filter(d => d.value > 0)

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            Attendance Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="attendanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Cumulative Attendance']}
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '12px',
                  }}
                />
                <Area type="monotone" dataKey="cumulative" stroke="#6366f1" fill="url(#attendanceGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-gray-400">No attendance history yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-sm">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-gray-600">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-gray-400">No data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
