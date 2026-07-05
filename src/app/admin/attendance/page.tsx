'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ClipboardList,
  Clock,
  Play,
  Square,
  CheckCircle,
  XCircle,
  Search,
  Users,
  Percent,
} from 'lucide-react'
import type { Batch } from '@/types/database'

interface SessionRow {
  id: string
  session_date: string
  status: string
  attendance_open: string | null
  attendance_close: string | null
  attendance_word: string | null
}

interface RosterEntry {
  id: string
  full_name: string
  email: string
  profile_image_url: string | null
  state: 'present' | 'grace' | 'absent' | 'pending'
}

export default function AdminAttendancePage() {
  const supabase = createClient()

  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [windowLoading, setWindowLoading] = useState(false)

  const activeSession = sessions.find((s) => s.id === selectedSession) ?? null

  // Batches
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('batches').select('*').order('name')
      setBatches((data as Batch[]) ?? [])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sessions for selected batch
  useEffect(() => {
    if (!selectedBatch) {
      setSessions([])
      setSelectedSession('')
      return
    }
    async function load() {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_date, status, attendance_open, attendance_close, attendance_word')
        .eq('batch_id', selectedBatch)
        .order('session_date', { ascending: false })
        .limit(60)
      setSessions((data as SessionRow[]) ?? [])
    }
    load()
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRoster = useCallback(async () => {
    if (!selectedBatch || !selectedSession) {
      setRoster([])
      return
    }
    setRosterLoading(true)
    const [studentsRes, attRes] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('id, full_name, email, profile_image_url')
        .eq('batch_id', selectedBatch)
        .eq('status', 'active')
        .order('full_name'),
      supabase
        .from('attendance')
        .select('student_id, decision, status, is_grace')
        .eq('session_id', selectedSession),
    ])

    const attMap = new Map<string, { decision: string | null; status: string; is_grace: boolean | null }>()
    for (const a of (attRes.data ?? []) as { student_id: string; decision: string | null; status: string; is_grace: boolean | null }[]) {
      attMap.set(a.student_id, { decision: a.decision, status: a.status, is_grace: a.is_grace })
    }

    setRoster(
      ((studentsRes.data ?? []) as { id: string; full_name: string; email: string; profile_image_url: string | null }[]).map((s) => {
        const rec = attMap.get(s.id)
        let state: RosterEntry['state'] = 'absent'
        if (rec) {
          if (rec.decision === 'rejected' || rec.status === 'rejected') state = 'absent'
          else if (rec.is_grace) state = 'grace'
          else if (rec.decision === 'accepted' || rec.status === 'approved') state = 'present'
          else state = 'pending'
        }
        return { id: s.id, full_name: s.full_name, email: s.email, profile_image_url: s.profile_image_url, state }
      })
    )
    setRosterLoading(false)
  }, [selectedBatch, selectedSession]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRoster() }, [fetchRoster])

  async function refreshSession() {
    if (!selectedBatch) return
    const { data } = await supabase
      .from('sessions')
      .select('id, session_date, status, attendance_open, attendance_close, attendance_word')
      .eq('batch_id', selectedBatch)
      .order('session_date', { ascending: false })
      .limit(60)
    setSessions((data as SessionRow[]) ?? [])
  }

  async function handleWindow(action: 'open_attendance' | 'close_attendance') {
    if (!selectedSession) return
    setWindowLoading(true)
    try {
      const res = await fetch(`/api/admin/sessions/${selectedSession}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? 'Failed to update window')
      } else {
        toast.success(action === 'open_attendance' ? 'Attendance window opened' : 'Attendance window closed')
        await refreshSession()
      }
    } catch {
      toast.error('Failed to update window')
    } finally {
      setWindowLoading(false)
    }
  }

  async function handleOverride(studentId: string, action: 'present' | 'absent') {
    if (!selectedSession) return
    setActionLoading(studentId)
    try {
      const res = await fetch('/api/admin/attendance/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: selectedSession, student_id: studentId, action }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to update attendance')
        return
      }
      setRoster((prev) =>
        prev.map((r) => (r.id === studentId ? { ...r, state: action === 'present' ? 'present' : 'absent' } : r))
      )
      toast.success(action === 'present' ? 'Marked present' : 'Marked absent')
    } catch {
      toast.error('Failed to update attendance')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = roster.filter(
    (r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase())
  )
  const presentCount = roster.filter((r) => r.state === 'present' || r.state === 'grace').length
  const total = roster.length
  const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0

  const stateBadge = (state: RosterEntry['state']) => {
    switch (state) {
      case 'present':
        return <Badge variant="success">Present</Badge>
      case 'grace':
        return <Badge variant="secondary">Grace</Badge>
      case 'pending':
        return <Badge variant="warning">Pending</Badge>
      default:
        return <Badge variant="secondary">Absent</Badge>
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
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and override attendance for any batch and session.
        </p>
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
                {format(new Date(s.session_date), 'EEE, MMM d, yyyy')} - {s.status.replace('_', ' ')}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Window controls + summary */}
      {activeSession && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <strong className="text-gray-900">{presentCount}</strong> / {total} present
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <strong className="text-gray-900">{pct}%</strong> attendance
                </span>
              </div>
              <Badge
                variant={
                  activeSession.status === 'attendance_open'
                    ? 'success'
                    : activeSession.status === 'scheduled'
                      ? 'secondary'
                      : 'warning'
                }
              >
                <Clock className="mr-1 h-3 w-3" />
                {activeSession.status.replace('_', ' ')}
              </Badge>
            </div>

            <div className="flex gap-2">
              {activeSession.status === 'attendance_open' ? (
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={windowLoading}
                  onClick={() => handleWindow('close_attendance')}
                >
                  <Square className="h-3.5 w-3.5" />
                  Close Window
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={windowLoading}
                  onClick={() => handleWindow('open_attendance')}
                >
                  <Play className="h-3.5 w-3.5" />
                  {activeSession.status === 'scheduled' ? 'Open Window' : 'Reopen Window'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeSession?.attendance_word && activeSession.status === 'attendance_open' && (
        <Card className="!bg-violet-50/60 !border-violet-200/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-xl bg-violet-100 p-2.5"><span className="text-lg">🔑</span></div>
            <div>
              <p className="text-xs font-medium text-violet-600 uppercase tracking-wider">Verification Word</p>
              <p className="text-2xl font-bold font-mono tracking-[0.3em] text-violet-900 mt-1">{activeSession.attendance_word}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedBatch ? (
        <EmptyState icon={ClipboardList} title="Select a batch" description="Choose a batch and session to view attendance." />
      ) : !selectedSession ? (
        <EmptyState icon={Clock} title="Select a session" description="Choose a session to see who's present and manage attendance." />
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search students..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {rosterLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} shape="rect" height={56} />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {roster.length === 0 ? 'No active students in this batch.' : 'No students match your search.'}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-xl glass-subtle px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        src={student.profile_image_url}
                        fallback={student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{student.full_name}</p>
                        <p className="truncate text-xs text-gray-500">{student.email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {stateBadge(student.state)}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === student.id || student.state === 'present' || student.state === 'grace'}
                        onClick={() => handleOverride(student.id, 'present')}
                        className="text-emerald-700"
                        title="Mark present"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === student.id || student.state === 'absent'}
                        onClick={() => handleOverride(student.id, 'absent')}
                        className="text-red-600"
                        title="Mark absent"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
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
