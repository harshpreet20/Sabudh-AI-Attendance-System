import { requireAuth, getUserProfile } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { PerformanceChart } from '@/components/dashboard/performance-chart'
import { PriorityAnnouncements } from '@/components/dashboard/priority-announcements'
import { WeeklyAttendance } from '@/components/dashboard/weekly-attendance'
import {
  CheckCircle,
  XCircle,
  Calendar,
  TrendingUp,
  Award,
  Clock,
  BookOpen,
  UserPlus,
} from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const profile = await getUserProfile(user.id)

  // If no profile, show onboarding prompt
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={UserPlus}
          title="Welcome to Sabudh AI"
          description="Your student profile has not been set up yet. Please contact your administrator to complete your enrollment."
          action={
            <Link
              href="/dashboard/profile"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              Go to Profile
            </Link>
          }
        />
      </div>
    )
  }

  const attendancePercentage = profile.attendance_percentage ?? 0
  const classesAttended = profile.present_count ?? 0
  const totalClasses = profile.total_sessions ?? 0
  const classesAbsent = totalClasses - classesAttended

  // Fetch upcoming sessions for the student's batch
  let upcomingSessions: Array<{
    id: string
    session_date: string
    attendance_open: string | null
    attendance_close: string | null
    status: string
  }> = []

  if (profile.batch_id) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, session_date, attendance_open, attendance_close, status')
      .eq('batch_id', profile.batch_id)
      .in('status', ['scheduled', 'attendance_open'])
      .gte('session_date', new Date().toISOString().split('T')[0])
      .order('session_date', { ascending: true })
      .limit(5)

    upcomingSessions = sessions ?? []
  }

  // Fetch recent notifications
  const { data: recentNotifications } = await supabase
    .from('notifications')
    .select('id, title, message, type, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Check today's attendance status
  const today = new Date().toISOString().split('T')[0]
  let todayStatus: 'no_class' | 'attendance_open' | 'submitted' | 'upcoming' = 'no_class'

  if (profile.batch_id) {
    const { data: todaySessions } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('batch_id', profile.batch_id)
      .eq('session_date', today)
      .limit(1)

    if (todaySessions && todaySessions.length > 0) {
      const session = todaySessions[0]
      if (session.status === 'attendance_open') {
        // Check if already submitted
        const { data: existingAttendance } = await supabase
          .from('attendance')
          .select('id')
          .eq('session_id', session.id)
          .eq('student_id', profile.id)
          .limit(1)

        todayStatus = existingAttendance && existingAttendance.length > 0
          ? 'submitted'
          : 'attendance_open'
      } else if (session.status === 'scheduled') {
        todayStatus = 'upcoming'
      }
    }
  }

  // Certificate progress - assume 75% is required
  const requiredPercentage = 75
  const certificateEligible = attendancePercentage >= requiredPercentage

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome back, {profile.full_name.split(' ')[0]}!
            </h2>
            <p className="mt-1 text-gray-500">
              {todayStatus === 'no_class' && "No classes scheduled for today."}
              {todayStatus === 'upcoming' && "You have a class scheduled for today."}
              {todayStatus === 'attendance_open' && "Attendance is open! Mark your attendance now."}
              {todayStatus === 'submitted' && "You've already marked your attendance today."}
            </p>
          </div>
          {todayStatus === 'attendance_open' && (
            <Link
              href="/dashboard/attendance"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              Mark Attendance
            </Link>
          )}
          {todayStatus === 'submitted' && (
            <Badge variant="success" className="px-3 py-1.5 text-sm">
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
              Attendance Recorded
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Priority Announcements */}
      <PriorityAnnouncements
        batchId={profile.batch_id}
        organizationId={profile.organization_id}
      />

      {/* Attendance Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Attendance %</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {attendancePercentage.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-full bg-blue-50 p-3">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Present</p>
                <p className="mt-1 text-3xl font-bold text-green-600">
                  {classesAttended}
                </p>
              </div>
              <div className="rounded-full bg-green-50 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Absent</p>
                <p className="mt-1 text-3xl font-bold text-red-600">
                  {classesAbsent}
                </p>
              </div>
              <div className="rounded-full bg-red-50 p-3">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Sessions</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {totalClasses}
                </p>
              </div>
              <div className="rounded-full bg-purple-50 p-3">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <PerformanceChart
        studentId={profile.id}
        batchId={profile.batch_id}
        presentCount={classesAttended}
        absentCount={classesAbsent}
        lateCount={profile.late_count ?? 0}
      />

      {/* Weekly Attendance */}
      <WeeklyAttendance studentId={profile.id} batchId={profile.batch_id} />

      {/* Certificate Progress and Upcoming Sessions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Certificate Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              Certificate Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-600">Current Attendance</span>
                  <span className="font-semibold text-gray-900">
                    {attendancePercentage.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={attendancePercentage}
                  variant={certificateEligible ? 'success' : attendancePercentage >= 60 ? 'warning' : 'danger'}
                  size="lg"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Required: {requiredPercentage}% attendance
                </p>
              </div>

              {certificateEligible ? (
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm font-medium text-green-800">
                    You are eligible for a certificate!
                  </p>
                  <Link
                    href="/dashboard/certificate"
                    className="mt-2 inline-block text-sm font-medium text-green-700 underline hover:text-green-900"
                  >
                    View Certificate
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">
                    You need{' '}
                    <span className="font-semibold">
                      {(requiredPercentage - attendancePercentage).toFixed(1)}%
                    </span>{' '}
                    more attendance to become eligible.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Upcoming Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No upcoming sessions"
                description="There are no sessions scheduled at the moment."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <ul className="space-y-3">
                {upcomingSessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        Session {session.session_date}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(session.session_date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {session.attendance_open && session.attendance_close && (
                          <> &middot; {session.attendance_open.slice(0, 5)} - {session.attendance_close.slice(0, 5)}</>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        session.status === 'attendance_open' ? 'success' : 'secondary'
                      }
                    >
                      {session.status === 'attendance_open' ? 'Open' : 'Scheduled'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Link
            href="/dashboard/notifications"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {!recentNotifications || recentNotifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No recent activity.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentNotifications.map((notification) => (
                <li
                  key={notification.id}
                  className="flex items-start gap-3 py-3"
                >
                  <div
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      notification.read_at ? 'bg-gray-300' : 'bg-blue-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {notification.title}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(notification.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
