import { requireAuth, getUserProfile } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { History, ClipboardList } from 'lucide-react'
import type { AttendanceStatus, AttendanceDecision } from '@/types/database'

const statusVariants: Record<AttendanceStatus, { variant: 'success' | 'warning' | 'default' | 'destructive' | 'secondary'; label: string }> = {
  draft: { variant: 'secondary', label: 'Draft' },
  uploaded: { variant: 'default', label: 'Uploaded' },
  processing: { variant: 'warning', label: 'Processing' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  manual_review: { variant: 'warning', label: 'Review' },
  excused: { variant: 'secondary', label: 'Excused' },
}

const decisionVariants: Record<AttendanceDecision, { variant: 'success' | 'warning' | 'default' | 'destructive' | 'secondary'; label: string }> = {
  accepted: { variant: 'success', label: 'Accepted' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  manual_review: { variant: 'warning', label: 'Manual Review' },
  pending: { variant: 'secondary', label: 'Pending' },
}

export default async function HistoryPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const profile = await getUserProfile(user.id)

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <EmptyState
          icon={ClipboardList}
          title="Profile not found"
          description="Your student profile has not been set up yet. Please contact your administrator."
        />
      </div>
    )
  }

  // Fetch attendance records with session data
  const { data: records, error } = await supabase
    .from('attendance')
    .select(`
      id,
      status,
      decision,
      submitted_at,
      created_at,
      sessions:session_id (
        id,
        session_date,
        attendance_open,
        attendance_close
      )
    `)
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const attendanceRecords = (records ?? []) as unknown as Array<{
    id: string
    status: AttendanceStatus
    decision: AttendanceDecision | null
    submitted_at: string | null
    created_at: string
    sessions: {
      id: string
      session_date: string
      attendance_open: string | null
      attendance_close: string | null
    } | null
  }>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-500" />
            Attendance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-6 text-center text-sm text-red-600">
              Failed to load attendance records. Please try again later.
            </p>
          ) : attendanceRecords.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No attendance records"
              description="Your attendance history will appear here once you start attending sessions."
              className="border-0 bg-transparent"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRecords.map((record) => {
                    const statusConfig = statusVariants[record.status] || statusVariants.draft
                    const decisionConfig = record.decision
                      ? decisionVariants[record.decision] || decisionVariants.pending
                      : null

                    return (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap">
                          {record.sessions?.session_date
                            ? new Date(record.sessions.session_date).toLocaleDateString('en-IN', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {record.submitted_at
                            ? new Date(record.submitted_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : record.sessions?.attendance_open?.slice(0, 5) || '-'}
                        </TableCell>
                        <TableCell>
                          <span className="max-w-[200px] truncate block">
                            {record.sessions?.session_date
                              ? `Session ${record.sessions.session_date}`
                              : 'Unknown Session'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {decisionConfig ? (
                            <Badge variant={decisionConfig.variant}>
                              {decisionConfig.label}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
