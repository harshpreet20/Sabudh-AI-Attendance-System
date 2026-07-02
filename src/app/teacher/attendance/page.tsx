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
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, XCircle, ClipboardList, Clock, Gift } from 'lucide-react'
import type { Batch } from '@/types/database'

interface SessionRecord {
  id: string
  session_date: string
  status: string
  batch_id: string
  attendance_open: string | null
  attendance_close: string | null
  attendance_word: string | null
}

interface AttendanceRecord {
  id: string
  student_id: string
  status: string
  decision: string | null
  submitted_at: string | null
  is_grace: boolean | null
  grace_reason: string | null
  student_profiles: {
    full_name: string
    email: string
    profile_image_url: string | null
  }
}

interface StudentOption {
  id: string
  full_name: string
  email: string
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

  // Grace attendance dialog state
  const [graceDialogOpen, setGraceDialogOpen] = useState(false)
  const [graceStudentId, setGraceStudentId] = useState('')
  const [graceReason, setGraceReason] = useState('')
  const [graceSubmitting, setGraceSubmitting] = useState(false)
  const [eligibleStudents, setEligibleStudents] = useState<StudentOption[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  const fetchBatchesAndSessions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
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
        .select('id, session_date, status, batch_id, attendance_open, attendance_close, attendance_word')
        .eq('batch_id', selectedBatch)
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
        .select('id, student_id, status, decision, submitted_at, is_grace, grace_reason, student_profiles(full_name, email, profile_image_url)')
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

  async function openGraceDialog() {
    if (!selectedBatch || !selectedSession) return

    setGraceDialogOpen(true)
    setGraceStudentId('')
    setGraceReason('')
    setLoadingStudents(true)

    // Fetch all students in the batch
    const { data: allStudents } = await supabase
      .from('student_profiles')
      .select('id, full_name, email')
      .eq('batch_id', selectedBatch)
      .eq('status', 'active')
      .order('full_name')

    // Get student IDs who already have attendance for this session
    const { data: existingAttendance } = await supabase
      .from('attendance')
      .select('student_id')
      .eq('session_id', selectedSession)

    const attendedStudentIds = new Set(
      (existingAttendance ?? []).map((a: { student_id: string }) => a.student_id)
    )

    // Filter out students who already have attendance
    const eligible = (allStudents ?? []).filter(
      (s: { id: string; full_name: string; email: string }) => !attendedStudentIds.has(s.id)
    )

    setEligibleStudents(eligible as StudentOption[])
    setLoadingStudents(false)
  }

  async function handleGrantGrace() {
    if (!graceStudentId || !graceReason.trim()) {
      toast.error('Please select a student and provide a reason')
      return
    }

    setGraceSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Not authenticated')
      setGraceSubmitting(false)
      return
    }

    const now = new Date().toISOString()

    const { data: inserted, error } = await supabase
      .from('attendance')
      .insert({
        session_id: selectedSession,
        student_id: graceStudentId,
        status: 'approved',
        decision: 'accepted',
        is_grace: true,
        grace_reason: graceReason.trim(),
        grace_granted_by: user.id,
        submitted_at: now,
        verified_at: now,
      })
      .select('id, student_id, status, decision, submitted_at, is_grace, grace_reason, student_profiles(full_name, email, profile_image_url)')
      .single()

    if (error) {
      toast.error('Failed to grant grace attendance')
      setGraceSubmitting(false)
      return
    }

    toast.success('Grace attendance granted')
    setAttendanceRecords(prev => [inserted as unknown as AttendanceRecord, ...prev])
    setGraceDialogOpen(false)
    setGraceStudentId('')
    setGraceReason('')
    setGraceSubmitting(false)
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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

        {selectedBatch && selectedSession && (
          <Button variant="outline" onClick={openGraceDialog}>
            <Gift className="mr-2 h-4 w-4" />
            Grant Grace Attendance
          </Button>
        )}
      </div>

      {selectedSession && (() => {
        const activeSession = sessions.find((s) => s.id === selectedSession)
        if (!activeSession?.attendance_word) return null
        return (
          <Card className="!bg-violet-50/60 !border-violet-200/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-xl bg-violet-100 p-2.5">
                <span className="text-lg">🔑</span>
              </div>
              <div>
                <p className="text-xs font-medium text-violet-600 uppercase tracking-wider">Verification Word — Display to Students</p>
                <p className="text-2xl font-bold font-mono tracking-[0.3em] text-violet-900 mt-1">{activeSession.attendance_word}</p>
              </div>
            </CardContent>
          </Card>
        )
      })()}

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
                      {record.is_grace && (
                        <Badge variant="secondary">Grace</Badge>
                      )}
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

      {/* Grace Attendance Dialog */}
      <Dialog
        open={graceDialogOpen}
        onClose={() => setGraceDialogOpen(false)}
        title="Grant Grace Attendance"
        description="Grant attendance to a student who was unable to submit on their own."
        footer={
          <>
            <Button variant="outline" onClick={() => setGraceDialogOpen(false)} disabled={graceSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleGrantGrace} disabled={graceSubmitting || !graceStudentId || !graceReason.trim()}>
              {graceSubmitting ? 'Granting...' : 'Grant Attendance'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {loadingStudents ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-20" />
            </div>
          ) : eligibleStudents.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              All students in this batch already have attendance for this session.
            </p>
          ) : (
            <>
              <Select
                label="Student"
                value={graceStudentId}
                onChange={(e) => setGraceStudentId(e.target.value)}
              >
                <option value="">Select a student</option>
                {eligibleStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.email})
                  </option>
                ))}
              </Select>

              <Textarea
                label="Reason for grace attendance"
                placeholder="e.g. Student had connectivity issues, was present in class but app failed..."
                value={graceReason}
                onChange={(e) => setGraceReason(e.target.value)}
                rows={3}
              />
            </>
          )}
        </div>
      </Dialog>
    </div>
  )
}
