import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Award,
  CalendarClock,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

type AttendanceStatusVariant = 'success' | 'destructive' | 'warning' | 'secondary'

function getStatusBadgeVariant(status: string): AttendanceStatusVariant {
  switch (status) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'destructive'
    case 'manual_review':
      return 'warning'
    default:
      return 'secondary'
  }
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'manual_review':
      return 'Manual Review'
    case 'draft':
      return 'Draft'
    case 'uploaded':
      return 'Uploaded'
    case 'processing':
      return 'Processing'
    case 'excused':
      return 'Excused'
    default:
      return status
  }
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ElementType
  iconBgClass: string
  iconColorClass: string
  valueColorClass?: string
  subtitle?: string
  href?: string
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconBgClass,
  iconColorClass,
  valueColorClass = 'text-gray-900',
  subtitle,
  href,
}: StatCardProps) {
  const content = (
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`mt-1 text-3xl font-bold ${valueColorClass}`}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-full p-3 ${iconBgClass}`}>
          <Icon className={`h-6 w-6 ${iconColorClass}`} />
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="transition-shadow hover:shadow-md">{content}</Card>
      </Link>
    )
  }

  return <Card>{content}</Card>
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // First, get today's session IDs so we can count attendance for today
  const { data: todaySessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('session_date', today)

  const todaySessionIds = (todaySessions ?? []).map((s) => s.id)

  // Run all stat queries in parallel
  const [
    presentResult,
    totalActiveResult,
    avgAttendanceResult,
    pendingReviewResult,
    certEligibleResult,
    activeSessionsResult,
    recentAttendanceResult,
    atRiskResult,
    upcomingSessionsResult,
  ] = await Promise.all([
    // 1. Students present today
    todaySessionIds.length > 0
      ? supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .in('session_id', todaySessionIds)
      : Promise.resolve({ count: 0, data: null, error: null }),

    // 2. Total active students
    supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),

    // 3. Average attendance percentage
    supabase
      .from('student_profiles')
      .select('attendance_percentage')
      .eq('status', 'active'),

    // 4. Pending manual reviews
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual_review'),

    // 5. Certificate eligible (>= 80%)
    supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('attendance_percentage', 80),

    // 6. Active sessions
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'attendance_open'),

    // 7. Recent attendance feed (last 10)
    supabase
      .from('attendance')
      .select(
        'id, status, submitted_at, created_at, student_id, student_profiles!inner(full_name)'
      )
      .order('created_at', { ascending: false })
      .limit(10),

    // 8. Students at risk (< 75%)
    supabase
      .from('student_profiles')
      .select('id, full_name, attendance_percentage, batch_id')
      .eq('status', 'active')
      .lt('attendance_percentage', 75)
      .order('attendance_percentage', { ascending: true })
      .limit(10),

    // 9. Upcoming sessions
    supabase
      .from('sessions')
      .select('id, session_date, attendance_open, attendance_close, notes, status, batch_id')
      .in('status', ['scheduled', 'attendance_open'])
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .limit(5),
  ])

  // Process stats - handle errors gracefully by falling back to 0/empty
  const studentsPresent = presentResult.error ? 0 : (presentResult.count ?? 0)
  const totalActive = totalActiveResult.error ? 0 : (totalActiveResult.count ?? 0)
  const studentsAbsent = Math.max(0, totalActive - studentsPresent)

  // Calculate average attendance
  let avgAttendance = 0
  if (
    !avgAttendanceResult.error &&
    avgAttendanceResult.data &&
    avgAttendanceResult.data.length > 0
  ) {
    const profiles = avgAttendanceResult.data as Array<{
      attendance_percentage: number
    }>
    const sum = profiles.reduce((acc, p) => acc + (p.attendance_percentage ?? 0), 0)
    avgAttendance = sum / profiles.length
  }

  const pendingReviews = pendingReviewResult.error ? 0 : (pendingReviewResult.count ?? 0)
  const certEligible = certEligibleResult.error ? 0 : (certEligibleResult.count ?? 0)
  const activeSessions = activeSessionsResult.error ? 0 : (activeSessionsResult.count ?? 0)

  // Process lists - fall back to empty arrays on error
  const recentAttendance = recentAttendanceResult.error
    ? []
    : ((recentAttendanceResult.data ?? []) as unknown as Array<{
        id: string
        status: string
        submitted_at: string | null
        created_at: string
        student_id: string
        student_profiles: { full_name: string }
      }>)

  const atRiskStudents = atRiskResult.error
    ? []
    : ((atRiskResult.data ?? []) as Array<{
        id: string
        full_name: string
        attendance_percentage: number
        batch_id: string | null
      }>)

  const upcomingSessions = upcomingSessionsResult.error
    ? []
    : ((upcomingSessionsResult.data ?? []) as Array<{
        id: string
        session_date: string
        attendance_open: string | null
        attendance_close: string | null
        notes: string | null
        status: string
        batch_id: string
      }>)

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Summary for {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Students Present Today"
          value={studentsPresent}
          icon={UserCheck}
          iconBgClass="bg-green-50"
          iconColorClass="text-green-600"
          valueColorClass="text-green-600"
          subtitle={`out of ${totalActive} active students`}
        />
        <StatCard
          title="Students Absent Today"
          value={studentsAbsent < 0 ? 0 : studentsAbsent}
          icon={UserX}
          iconBgClass="bg-red-50"
          iconColorClass="text-red-600"
          valueColorClass="text-red-600"
        />
        <StatCard
          title="Overall Attendance"
          value={`${avgAttendance.toFixed(1)}%`}
          icon={TrendingUp}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          subtitle="average across active students"
        />
        <StatCard
          title="Pending Reviews"
          value={pendingReviews}
          icon={AlertTriangle}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          valueColorClass={pendingReviews > 0 ? 'text-amber-600' : 'text-gray-900'}
          href="/admin/students"
        />
        <StatCard
          title="Certificate Eligible"
          value={certEligible}
          icon={Award}
          iconBgClass="bg-purple-50"
          iconColorClass="text-purple-600"
          subtitle={totalActive > 0 ? `${((certEligible / totalActive) * 100).toFixed(0)}% of students` : undefined}
          href="/admin/certificates"
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          icon={CalendarClock}
          iconBgClass="bg-indigo-50"
          iconColorClass="text-indigo-600"
          href="/admin/sessions"
        />
      </div>

      {/* Bottom Sections */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent Attendance Feed */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Recent Attendance
            </CardTitle>
            <Link
              href="/admin/students"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentAttendance.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No attendance records"
                description="No attendance has been recorded yet."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAttendance.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.student_profiles?.full_name ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(record.status)}>
                          {formatStatusLabel(record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {record.submitted_at
                          ? format(parseISO(record.submitted_at), 'MMM d, h:mm a')
                          : format(parseISO(record.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Students at Risk + Upcoming Sessions stacked */}
        <div className="space-y-6">
          {/* Students at Risk */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Students at Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              {atRiskStudents.length === 0 ? (
                <EmptyState
                  icon={UserCheck}
                  title="All students on track"
                  description="No students are below the 75% attendance threshold."
                  className="border-0 bg-transparent py-6"
                />
              ) : (
                <ul className="space-y-3">
                  {atRiskStudents.map((student) => (
                    <li
                      key={student.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {student.full_name}
                        </p>
                        {student.batch_id && (
                          <p className="text-xs text-gray-400">
                            Batch: {student.batch_id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          student.attendance_percentage < 50
                            ? 'destructive'
                            : 'warning'
                        }
                      >
                        {student.attendance_percentage.toFixed(1)}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-indigo-500" />
                Upcoming Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingSessions.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No upcoming sessions"
                  description="There are no sessions scheduled."
                  className="border-0 bg-transparent py-6"
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
                          {session.notes || 'Session'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(parseISO(session.session_date), 'EEE, MMM d')}
                          {session.attendance_open && (
                            <>
                              {' · '}
                              {session.attendance_open.slice(0, 16)}
                            </>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant={
                          session.status === 'attendance_open'
                            ? 'success'
                            : 'secondary'
                        }
                      >
                        {session.status === 'attendance_open'
                          ? 'Open'
                          : 'Scheduled'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
