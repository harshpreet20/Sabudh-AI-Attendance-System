'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  CheckSquare,
  Calendar,
  Megaphone,
  TrendingUp,
  Clock,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface DashboardStats {
  totalStudents: number
  totalBatches: number
  todaySessions: number
  activeAnnouncements: number
  avgAttendance: number
  upcomingSchedules: number
}

interface AttendanceTrend {
  date: string
  present: number
  absent: number
}

interface BatchAttendance {
  name: string
  percentage: number
}

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444']

export default function TeacherDashboardPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [trends, setTrends] = useState<AttendanceTrend[]>([])
  const [batchData, setBatchData] = useState<BatchAttendance[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: batches } = await supabase
      .from('batches')
      .select('id, name')
      .eq('instructor_id', user.id)
      .eq('status', 'active')

    const batchIds = batches?.map(b => b.id) ?? []

    const { count: studentCount } = await supabase
      .from('student_profiles')
      .select('*', { count: 'exact', head: true })
      .in('batch_id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('status', 'active')

    const today = new Date().toISOString().split('T')[0]
    const { count: todaySessionCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', user.id)
      .eq('session_date', today)

    const { count: announcementCount } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', user.id)

    const { count: scheduleCount } = await supabase
      .from('class_schedules')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', user.id)
      .gte('scheduled_date', today)
      .eq('status', 'scheduled')

    const { data: students } = await supabase
      .from('student_profiles')
      .select('attendance_percentage')
      .in('batch_id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('status', 'active')

    const avg = students && students.length > 0
      ? Math.round(students.reduce((sum, s) => sum + (s.attendance_percentage ?? 0), 0) / students.length)
      : 0

    setStats({
      totalStudents: studentCount ?? 0,
      totalBatches: batchIds.length,
      todaySessions: todaySessionCount ?? 0,
      activeAnnouncements: announcementCount ?? 0,
      avgAttendance: avg,
      upcomingSchedules: scheduleCount ?? 0,
    })

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: recentSessions } = await supabase
      .from('sessions')
      .select('id, session_date')
      .eq('instructor_id', user.id)
      .gte('session_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('session_date', { ascending: true })

    if (recentSessions && recentSessions.length > 0) {
      const trendData: AttendanceTrend[] = []
      for (const session of recentSessions) {
        const { count: presentCount } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id)
          .eq('status', 'approved')

        const { count: totalCount } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id)

        trendData.push({
          date: new Date(session.session_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          present: presentCount ?? 0,
          absent: (totalCount ?? 0) - (presentCount ?? 0),
        })
      }
      setTrends(trendData)
    }

    if (batches && batches.length > 0) {
      const batchAttData: BatchAttendance[] = []
      for (const batch of batches) {
        const { data: batchStudents } = await supabase
          .from('student_profiles')
          .select('attendance_percentage')
          .eq('batch_id', batch.id)
          .eq('status', 'active')

        const batchAvg = batchStudents && batchStudents.length > 0
          ? Math.round(batchStudents.reduce((s, st) => s + (st.attendance_percentage ?? 0), 0) / batchStudents.length)
          : 0

        batchAttData.push({ name: batch.name, percentage: batchAvg })
      }
      setBatchData(batchAttData)
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  const statCards = [
    { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100/60' },
    { label: 'Active Batches', value: stats?.totalBatches ?? 0, icon: Calendar, color: 'text-violet-600', bg: 'bg-violet-100/60' },
    { label: "Today's Sessions", value: stats?.todaySessions ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100/60' },
    { label: 'Avg Attendance', value: `${stats?.avgAttendance ?? 0}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100/60' },
    { label: 'Announcements', value: stats?.activeAnnouncements ?? 0, icon: Megaphone, color: 'text-rose-600', bg: 'bg-rose-100/60' },
    { label: 'Upcoming Schedules', value: stats?.upcomingSchedules ?? 0, icon: CheckSquare, color: 'text-blue-600', bg: 'bg-blue-100/60' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your classes and student performance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`rounded-xl ${card.bg} p-3 backdrop-blur-sm`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '12px',
                    }}
                  />
                  <Bar dataKey="present" fill="#6366f1" radius={[6, 6, 0, 0]} name="Present" />
                  <Bar dataKey="absent" fill="#f87171" radius={[6, 6, 0, 0]} name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">No session data in the last 7 days</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Batch-wise Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {batchData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={batchData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="percentage"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}%`}
                    >
                      {batchData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {batchData.map((b, i) => (
                    <Badge key={b.name} variant="secondary" className="gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {b.name} — {b.percentage}%
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">No batch data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
