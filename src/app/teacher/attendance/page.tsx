'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { CheckCircle, XCircle, ClipboardList, Clock } from 'lucide-react'
import type { Batch } from '@/types/database'

interface SessionRecord {
  id: string
  session_date: string
  status: string
  batch_id: string
  attendance_open: string | null
  attendance_close: string | null
}

interface AttendanceRecord {
  id: string
  student_id: string
  status: string
  decision: string | null
  submitted_at: string | null
  student_profiles: {
    full_name: string
    email: string
    profile_image_url: string | null
  }
}

export default function TeacherAttendancePage() {
  const supabase = createClient()
  const [batches, setBatches] = useState<Batch[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAttendance, setLoadingAttendance] = useState(false)

  const fetchBatchesAndSessions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'active')
      .order('name')

    setBatches((myBatches as Batch[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatchesAndSessions()
  }, [fetchBatchesAndSessions])

  useEffect(() => {
    if (!selectedBatch) {
      setSessions([])
      return
    }

    async function fetchSessions() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('sessions')
        .select('id, session_date, status, batch_id, attendance_open, attendance_close')
        .eq('batch_id', selectedBatch)
        .eq('instructor_id', user.id)
        .order('session_date', { ascending: false })
        .limit(30)

      setSessions((data as SessionRecord[]) ?? [])
    }

    fetchSessions()
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedSession) {
      setAttendanceRecords([])
      return
    }

    async function fetchAttendance() {
      setLoadingAttendance(true)
      const { data } = await supabase
        .from('attendance')
        .select('id, student_id, status, decision, submitted_at, student_profiles(full_name, email, profile_image_url)')
        .eq('session_id', selectedSession)
        .order('submitted_at', { ascending: false })

      setAttendanceRecords((data as unknown as AttendanceRecord[]) ?? [])
      setLoadingAttendance(false)
    }

    fetchAttendance()
  }, [selectedSession]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdateStatus(attendanceId: string, decision: 'accepted' | 'rejected') {
    const status = decision === 'accepted' ? 'approved' : 'rejected'
    const { error } = await supabase
      .from('attendance')
      .update({ decision, status })
      .eq('id', attendanceId)

    if (error) {
      toast.error('Failed to update')
    } else {
      toast.success(`Attendance ${decision}`)
      setAttendanceRecords(prev =>
        prev.map(r => r.id === attendanceId ? { ...r, decision, status } : r)
      )
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
        <p className="mt-1 text-sm text-gray-500">Review and manage student attendance for your sessions</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          label="Batch"
          value={selectedBatch}
          onChange={(e) => { setSelectedBatch(e.target.value); setSelectedSession('') }}
        >
          <option value="">Select Batch</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>

        {sessions.length > 0 && (
          <Select
            label="Session"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            <option value="">Select Session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.session_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}  - {s.status}
              </option>
            ))}
          </Select>
        )}
      </div>

      {!selectedBatch && (
        <EmptyState
          icon={ClipboardList}
          title="Select a batch"
          description="Choose a batch to view sessions and attendance records."
        />
      )}

      {selectedBatch && !selectedSession && sessions.length === 0 && (
        <EmptyState
          icon={Clock}
          title="No sessions found"
          description="No sessions have been created for this batch yet."
        />
      )}

      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Records</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAttendance ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : attendanceRecords.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No attendance records for this session</p>
            ) : (
              <div className="space-y-2">
                {attendanceRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between rounded-xl glass-subtle px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={record.student_profiles?.profile_image_url}
                        fallback={record.student_profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{record.student_profiles?.full_name}</p>
                        <p className="text-xs text-gray-500">{record.student_profiles?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          record.decision === 'accepted' ? 'success'
                            : record.decision === 'rejected' ? 'destructive'
                              : 'warning'
                        }
                      >
                        {record.decision ?? record.status}
                      </Badge>
                      {record.decision !== 'accepted' && (
                        <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(record.id, 'accepted')}>
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </Button>
                      )}
                      {record.decision !== 'rejected' && (
                        <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(record.id, 'rejected')}>
                          <XCircle className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
