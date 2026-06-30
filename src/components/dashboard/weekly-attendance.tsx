'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface WeeklyAttendanceProps {
  studentId: string
  batchId: string | null
}

interface WeekData {
  label: string
  percentage: number
  attended: number
  total: number
}

export function WeeklyAttendance({ studentId, batchId }: WeeklyAttendanceProps) {
  const [weeks, setWeeks] = useState<WeekData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchWeekly() {
      if (!batchId) {
        setLoading(false)
        return
      }

      const supabase = createClient()
      const now = new Date()
      const weeklyData: WeekData[] = []

      for (let w = 3; w >= 0; w--) {
        const weekEnd = new Date(now)
        weekEnd.setDate(now.getDate() - (w * 7))
        const weekStart = new Date(weekEnd)
        weekStart.setDate(weekEnd.getDate() - 6)

        const startStr = weekStart.toISOString().split('T')[0]
        const endStr = weekEnd.toISOString().split('T')[0]

        const { data: sessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('batch_id', batchId)
          .in('status', ['completed', 'attendance_closed'])
          .gte('session_date', startStr)
          .lte('session_date', endStr)

        if (!sessions || sessions.length === 0) {
          weeklyData.push({
            label: weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
            percentage: 0,
            attended: 0,
            total: 0,
          })
          continue
        }

        const sessionIds = sessions.map(s => s.id)
        const { data: attendance } = await supabase
          .from('attendance')
          .select('status')
          .eq('student_id', studentId)
          .in('session_id', sessionIds)

        const attended = attendance?.filter(a => a.status === 'approved').length ?? 0
        const total = sessions.length
        const pct = total > 0 ? Math.round((attended / total) * 100) : 0

        weeklyData.push({
          label: weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          percentage: pct,
          attended,
          total,
        })
      }

      setWeeks(weeklyData)
      setLoading(false)
    }

    fetchWeekly()
  }, [studentId, batchId])

  if (loading) return null

  const hasData = weeks.some(w => w.total > 0)
  if (!hasData) return null

  const currentWeek = weeks[weeks.length - 1]
  const prevWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null
  const trend = prevWeek && prevWeek.total > 0
    ? currentWeek.percentage - prevWeek.percentage
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-violet-500" />
          Weekly Attendance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div>
            <p className="text-3xl font-bold text-gray-900">{currentWeek.percentage}%</p>
            <p className="text-sm text-gray-500">This week</p>
          </div>
          {trend !== null && (
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium ${
              trend > 0 ? 'bg-emerald-50 text-emerald-700' : trend < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'
            }`}>
              {trend > 0 ? <TrendingUp className="h-4 w-4" /> : trend < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {trend > 0 ? '+' : ''}{trend}%
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {weeks.map((w, i) => (
            <div key={i} className="text-center">
              <div className="mx-auto mb-1 h-16 w-4 rounded-full bg-gray-100 relative overflow-hidden">
                <div
                  className="absolute bottom-0 w-full rounded-full transition-all duration-500"
                  style={{
                    height: `${w.total > 0 ? w.percentage : 0}%`,
                    backgroundColor: w.percentage >= 75 ? '#10b981' : w.percentage >= 50 ? '#f59e0b' : w.total > 0 ? '#ef4444' : '#e5e7eb',
                  }}
                />
              </div>
              <p className="text-xs font-medium text-gray-600">{w.label}</p>
              <p className="text-xs text-gray-400">
                {w.total > 0 ? `${w.attended}/${w.total}` : '—'}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
