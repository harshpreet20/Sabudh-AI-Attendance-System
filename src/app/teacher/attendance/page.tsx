'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { ProfilePopover } from '@/components/ui/profile-popover'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { CheckCircle, XCircle, ClipboardList, Clock, Gift, BookOpen, Save, Play, Square } from 'lucide-react'
import { ElectricBorder } from '@/components/ui/electric-border'
import { QrBackupPanel } from '@/components/attendance/qr-backup-panel'
import type { Batch } from '@/types/database'

interface SessionRecord {
  id: string
  session_date: string
  status: string
  batch_id: string
  attendance_open: string | null
  attendance_close: string | null
  attendance_word: string | null
  topic_taught: string | null
  next_topic: string | null
  topic_teacher_name: string | null
  topic_completion_pct: number
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

  // Topic tracking state
  const [topicTaught, setTopicTaught] = useState('')
  const [nextTopic, setNextTopic] = useState('')
  const [topicTeacherName, setTopicTeacherName] = useState('')
  const [topicCompletionPct, setTopicCompletionPct] = useState(0)
  const [savingTopic, setSavingTopic] = useState(false)

  // Attendance window controls state
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [openDialogVisible, setOpenDialogVisible] = useState(false)
  const [openSessionTarget, setOpenSessionTarget] = useState<string | null>(null)
  const [customCloseTime, setCustomCloseTime] = useState('')

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
        .select('id, session_date, status, batch_id, attendance_open, attendance_close, attendance_word, topic_taught, next_topic, topic_teacher_name, topic_completion_pct')
        .eq('batch_id', selectedBatch)
        .order('session_date', { ascending: false })
        .limit(300)

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

  const refreshSessions = useCallback(async () => {
    if (!selectedBatch) return
    const { data } = await supabase
      .from('sessions')
      .select('id, session_date, status, batch_id, attendance_open, attendance_close, attendance_word, topic_taught, next_topic, topic_teacher_name, topic_completion_pct')
      .eq('batch_id', selectedBatch)
      .order('session_date', { ascending: false })
      .limit(300)
    setSessions((data as SessionRecord[]) ?? [])
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  function initiateOpenAttendance(sessionId: string) {
    setOpenSessionTarget(sessionId)
    setCustomCloseTime('')
    setOpenDialogVisible(true)
  }

  async function confirmOpenAttendance() {
    if (!openSessionTarget) return
    setActionLoading(openSessionTarget)
    setOpenDialogVisible(false)

    try {
      const body: Record<string, string> = { action: 'open_attendance' }
      if (customCloseTime) {
        // customCloseTime is a datetime-local value (no timezone). Interpret it in
        // the teacher's local timezone and send a proper UTC ISO string so the
        // server stores the intended moment rather than treating it as UTC.
        const parsed = new Date(customCloseTime)
        if (!isNaN(parsed.getTime())) {
          body.attendance_close = parsed.toISOString()
        }
      }

      const res = await fetch(`/api/admin/sessions/${openSessionTarget}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()

      if (!res.ok || !result.success) {
        toast.error(result.error?.message ?? 'Failed to open attendance')
      } else {
        toast.success('Attendance window opened')
        await refreshSessions()
      }
    } catch {
      toast.error('Failed to open attendance')
    } finally {
      setActionLoading(null)
      setOpenSessionTarget(null)
      setCustomCloseTime('')
    }
  }

  async function handleCloseAttendance(sessionId: string) {
    setActionLoading(sessionId)
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_attendance' }),
      })
      const result = await res.json()

      if (!res.ok || !result.success) {
        toast.error(result.error?.message ?? 'Failed to close attendance')
      } else {
        toast.success('Attendance window closed')
        await refreshSessions()
      }
    } catch {
      toast.error('Failed to close attendance')
    } finally {
      setActionLoading(null)
    }
  }

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

  // Sync topic fields when session changes
  useEffect(() => {
    if (!selectedSession) {
      setTopicTaught('')
      setNextTopic('')
      setTopicTeacherName('')
      setTopicCompletionPct(0)
      return
    }
    const session = sessions.find((s) => s.id === selectedSession)
    if (session) {
      setTopicTaught(session.topic_taught ?? '')
      setNextTopic(session.next_topic ?? '')
      setTopicTeacherName(session.topic_teacher_name ?? '')
      setTopicCompletionPct(session.topic_completion_pct ?? 0)
    }
  }, [selectedSession, sessions])

  async function handleSaveTopic() {
    if (!selectedSession) return
    setSavingTopic(true)

    const { error } = await supabase
      .from('sessions')
      .update({
        topic_taught: topicTaught.trim() || null,
        next_topic: nextTopic.trim() || null,
        topic_teacher_name: topicTeacherName.trim() || null,
        topic_completion_pct: topicCompletionPct,
      })
      .eq('id', selectedSession)

    if (error) {
      toast.error('Failed to save topic info')
    } else {
      toast.success('Topic info saved')
      setSessions((prev) =>
        prev.map((s) =>
          s.id === selectedSession
            ? {
                ...s,
                topic_taught: topicTaught.trim() || null,
                next_topic: nextTopic.trim() || null,
                topic_teacher_name: topicTeacherName.trim() || null,
                topic_completion_pct: topicCompletionPct,
              }
            : s
        )
      )

      if (selectedBatch) {
        calculateAttendanceAlerts(selectedBatch)
      }
    }
    setSavingTopic(false)
  }

  async function calculateAttendanceAlerts(batchId: string) {
    const { data: batch } = await supabase
      .from('batches')
      .select('id, total_planned_sessions, attendance_threshold_pct, course_id, courses(attendance_requirement)')
      .eq('id', batchId)
      .single()

    if (!batch) return

    const courseData = batch.courses as unknown as { attendance_requirement: number } | { attendance_requirement: number }[] | null
    const course = Array.isArray(courseData) ? courseData[0] : courseData
    const thresholdPct = batch.attendance_threshold_pct
      ?? course?.attendance_requirement
      ?? 75

    const { data: batchSessions } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('batch_id', batchId)

    const totalSessions = batch.total_planned_sessions || (batchSessions?.length ?? 0)
    const completedSessions = batchSessions?.filter(s =>
      ['completed', 'attendance_closed'].includes(s.status)
    ).length ?? 0
    const remainingSessions = Math.max(0, totalSessions - completedSessions)

    const { data: students } = await supabase
      .from('student_profiles')
      .select('id, full_name, attendance_percentage, present_count, total_sessions')
      .eq('batch_id', batchId)
      .eq('status', 'active')

    if (!students || students.length === 0) return

    const alerts: Array<{
      student_id: string
      batch_id: string
      alert_type: string
      current_attendance_pct: number
      required_attendance_pct: number
      classes_remaining: number
      classes_needed: number
      message: string
    }> = []

    for (const student of students) {
      const currentPct = student.attendance_percentage ?? 0
      const presentCount = student.present_count ?? 0

      const neededPresent = Math.ceil((thresholdPct / 100) * totalSessions)
      const classesNeeded = Math.max(0, neededPresent - presentCount)
      const canMakeIt = classesNeeded <= remainingSessions

      if (currentPct < thresholdPct) {
        let alertType = 'warning'
        let message = ''

        if (!canMakeIt) {
          alertType = 'critical'
          message = `Your attendance is ${currentPct.toFixed(1)}% — below the ${thresholdPct}% threshold. Even attending all ${remainingSessions} remaining classes won't be enough for certificate eligibility. Please contact your instructor.`
        } else if (classesNeeded >= remainingSessions * 0.8) {
          alertType = 'urgent'
          message = `Urgent: Your attendance is ${currentPct.toFixed(1)}%. You must attend ${classesNeeded} of the ${remainingSessions} remaining classes to reach ${thresholdPct}% for certificate eligibility.`
        } else {
          message = `Your attendance is ${currentPct.toFixed(1)}% — below the ${thresholdPct}% requirement. You need to attend at least ${classesNeeded} more classes (${remainingSessions} remaining) to be eligible for the certificate.`
        }

        alerts.push({
          student_id: student.id,
          batch_id: batchId,
          alert_type: alertType,
          current_attendance_pct: currentPct,
          required_attendance_pct: thresholdPct,
          classes_remaining: remainingSessions,
          classes_needed: classesNeeded,
          message,
        })
      }
    }

    if (alerts.length > 0) {
      await supabase.from('attendance_alerts').insert(alerts)
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

      {/* Attendance Window Controls */}
      {selectedSession && (() => {
        const activeSession = sessions.find((s) => s.id === selectedSession)
        if (!activeSession) return null
        const isScheduled = activeSession.status === 'scheduled'
        const isOpen = activeSession.status === 'attendance_open'
        if (!isScheduled && !isOpen) return null
        const windowCard = (
          <Card className={isOpen ? '!bg-amber-50/60 !border-amber-200/50' : '!bg-emerald-50/60 !border-emerald-200/50'}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${isOpen ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                  {isOpen ? <Square className="h-5 w-5 text-amber-700" /> : <Play className="h-5 w-5 text-emerald-700" />}
                </div>
                <div>
                  <p className={`text-xs font-medium uppercase tracking-wider ${isOpen ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isOpen ? 'Attendance Window is Open' : 'Attendance Window is Closed'}
                  </p>
                  <p className={`text-sm mt-0.5 ${isOpen ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {isOpen
                      ? `Opened at ${new Date(activeSession.attendance_open!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Ready to open attendance for this session'}
                  </p>
                </div>
              </div>
              <div>
                {isScheduled && (
                  <Button
                    onClick={() => initiateOpenAttendance(activeSession.id)}
                    disabled={actionLoading === activeSession.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {actionLoading === activeSession.id ? 'Opening...' : 'Open Attendance'}
                  </Button>
                )}
                {isOpen && (
                  <Button
                    onClick={() => handleCloseAttendance(activeSession.id)}
                    disabled={actionLoading === activeSession.id}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    {actionLoading === activeSession.id ? 'Closing...' : 'Close Attendance'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
        // Highlight with an animated electric border only while attendance is live.
        return isOpen ? (
          <div className="space-y-4">
            <ElectricBorder borderRadius={16}>{windowCard}</ElectricBorder>
            <QrBackupPanel sessionId={activeSession.id} />
          </div>
        ) : (
          windowCard
        )
      })()}

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
                      <ProfilePopover profileId={record.student_id} profileType="student">
                        <Avatar
                          src={record.student_profiles?.profile_image_url}
                          fallback={record.student_profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
                          size="sm"
                        />
                      </ProfilePopover>
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

      {/* Topic Tracking */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              Session Topic Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Topic Taught Today"
                placeholder="e.g. Introduction to React Hooks"
                value={topicTaught}
                onChange={(e) => setTopicTaught(e.target.value)}
              />
              <Input
                label="Next Class Topic"
                placeholder="e.g. State Management with Redux"
                value={nextTopic}
                onChange={(e) => setNextTopic(e.target.value)}
              />
              <Input
                label="Topic Teacher"
                placeholder="e.g. Dr. Sharma"
                value={topicTeacherName}
                onChange={(e) => setTopicTeacherName(e.target.value)}
              />
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Topic Completion: <span className="font-bold text-indigo-600">{topicCompletionPct}%</span>
              </label>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400 w-6">0%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={topicCompletionPct}
                  onChange={(e) => setTopicCompletionPct(parseInt(e.target.value, 10))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-indigo-500 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-md"
                />
                <span className="text-xs text-gray-400 w-8">100%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${topicCompletionPct}%`,
                    background: topicCompletionPct < 30
                      ? '#ef4444'
                      : topicCompletionPct < 70
                        ? '#f59e0b'
                        : '#22c55e',
                  }}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveTopic} disabled={savingTopic}>
                <Save className="mr-2 h-4 w-4" />
                {savingTopic ? 'Saving...' : 'Save Topic Info'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Attendance Dialog */}
      <Dialog
        open={openDialogVisible}
        onClose={() => {
          setOpenDialogVisible(false)
          setOpenSessionTarget(null)
          setCustomCloseTime('')
        }}
        title="Open Attendance Window"
        description="Attendance will open immediately. You can optionally set a time for it to auto-close."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpenDialogVisible(false)
                setOpenSessionTarget(null)
                setCustomCloseTime('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOpenAttendance}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Open Now
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Auto-close time (optional)"
            type="datetime-local"
            value={customCloseTime}
            onChange={(e) => setCustomCloseTime(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Leave blank to keep the window open until you manually close it.
          </p>
        </div>
      </Dialog>

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
