'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Plus,
  Calendar,
  MoreHorizontal,
  Play,
  Square,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import type { Session, SessionStatus, Batch, Classroom } from '@/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionWithRelations extends Session {
  batches?: { name: string } | null
  classrooms?: { name: string } | null
}

type StatusBadgeVariant = 'secondary' | 'success' | 'warning' | 'default' | 'destructive'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAttendanceWord(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

const STATUS_BADGE_MAP: Record<SessionStatus, StatusBadgeVariant> = {
  scheduled: 'secondary',
  attendance_open: 'success',
  attendance_closed: 'warning',
  completed: 'default',
  cancelled: 'destructive',
  archived: 'secondary',
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: 'Scheduled',
  attendance_open: 'Attendance Open',
  attendance_closed: 'Attendance Closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
}

const ITEMS_PER_PAGE = 10

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const supabase = createClient()

  // Data state
  const [sessions, setSessions] = useState<SessionWithRelations[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Pagination
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterBatch, setFilterBatch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Dialog / form
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({
    batch_id: '',
    classroom_id: '',
    session_date: '',
    notes: '',
  })

  // Action dropdown
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Cancel confirmation
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelSessionId, setCancelSessionId] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('sessions')
        .select('*, batches(name), classrooms(name)', { count: 'exact' })
        .order('session_date', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      if (filterBatch) query = query.eq('batch_id', filterBatch)
      if (filterStatus) query = query.eq('status', filterStatus)
      if (filterDateFrom) query = query.gte('session_date', filterDateFrom)
      if (filterDateTo) query = query.lte('session_date', filterDateTo)

      const { data, count, error } = await query

      if (error) throw error

      setSessions((data as SessionWithRelations[]) ?? [])
      setTotalCount(count ?? 0)
    } catch {
      toast.error('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [page, filterBatch, filterStatus, filterDateFrom, filterDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBatches = useCallback(async () => {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')
    if (!error && data) setBatches(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchClassrooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('classrooms')
      .select('*')
      .eq('status', 'active')
      .order('name')
    if (!error && data) setClassrooms(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
    fetchClassrooms()
  }, [fetchBatches, fetchClassrooms])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // ---------------------------------------------------------------------------
  // Session actions
  // ---------------------------------------------------------------------------

  async function updateSessionStatus(id: string, status: SessionStatus) {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      toast.success(`Session ${STATUS_LABEL[status].toLowerCase()} successfully`)
      fetchSessions()
    } catch {
      toast.error('Failed to update session status')
    } finally {
      setOpenDropdown(null)
    }
  }

  async function handleCancelSession() {
    if (!cancelSessionId) return
    setCancelLoading(true)
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', cancelSessionId)

      if (error) throw error
      toast.success('Session cancelled')
      fetchSessions()
    } catch {
      toast.error('Failed to cancel session')
    } finally {
      setCancelLoading(false)
      setCancelDialogOpen(false)
      setCancelSessionId(null)
      setOpenDropdown(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Create session
  // ---------------------------------------------------------------------------

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('You must be logged in')
        return
      }

      const { error } = await supabase.from('sessions').insert({
        batch_id: formData.batch_id,
        classroom_id: formData.classroom_id || null,
        instructor_id: user.id,
        session_date: formData.session_date,
        attendance_word: generateAttendanceWord(),
        status: 'scheduled',
        notes: formData.notes || null,
      })

      if (error) throw error

      toast.success('Session created successfully')
      setDialogOpen(false)
      setFormData({
        batch_id: '',
        classroom_id: '',
        session_date: '',
        notes: '',
      })
      fetchSessions()
    } catch {
      toast.error('Failed to create session')
    } finally {
      setFormLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Close dropdown on outside click
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleClickOutside() {
      setOpenDropdown(null)
    }
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openDropdown])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage class sessions and attendance windows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Session
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Date from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value)
                setPage(1)
              }}
            />
            <Input
              label="Date to"
              type="date"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value)
                setPage(1)
              }}
            />
            <Select
              label="Batch"
              placeholder="All batches"
              value={filterBatch}
              onChange={(e) => {
                setFilterBatch(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select
              label="Status"
              placeholder="All statuses"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDateFrom('')
                setFilterDateTo('')
                setFilterBatch('')
                setFilterStatus('')
                setPage(1)
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} shape="rect" height={56} />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No sessions found"
          description="Create your first session to get started with attendance tracking."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Session
            </Button>
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Classroom</TableHead>
                  <TableHead>Attendance Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {format(new Date(session.session_date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>{session.batches?.name ?? '--'}</TableCell>
                    <TableCell>{session.classrooms?.name ?? '--'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {session.attendance_open && session.attendance_close
                        ? `${session.attendance_open.slice(0, 16)} - ${session.attendance_close.slice(0, 16)}`
                        : '--'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_MAP[session.status]}>
                        {STATUS_LABEL[session.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="relative inline-block">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenDropdown(
                              openDropdown === session.id ? null : session.id
                            )
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>

                        {openDropdown === session.id && (
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setOpenDropdown(null)
                                toast.info('View details coming soon')
                              }}
                            >
                              <Calendar className="h-4 w-4" />
                              View Details
                            </button>

                            {session.status === 'scheduled' && (
                              <button
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                                onClick={() =>
                                  updateSessionStatus(session.id, 'attendance_open')
                                }
                              >
                                <Play className="h-4 w-4" />
                                Open Attendance
                              </button>
                            )}

                            {session.status === 'attendance_open' && (
                              <button
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                                onClick={() =>
                                  updateSessionStatus(session.id, 'attendance_closed')
                                }
                              >
                                <Square className="h-4 w-4" />
                                Close Attendance
                              </button>
                            )}

                            {session.status === 'attendance_closed' && (
                              <button
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
                                onClick={() =>
                                  updateSessionStatus(session.id, 'completed')
                                }
                              >
                                <CheckCircle className="h-4 w-4" />
                                Complete Session
                              </button>
                            )}

                            {session.status !== 'cancelled' &&
                              session.status !== 'completed' && (
                                <button
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    setCancelSessionId(session.id)
                                    setCancelDialogOpen(true)
                                    setOpenDropdown(null)
                                  }}
                                >
                                  <XCircle className="h-4 w-4" />
                                  Cancel Session
                                </button>
                              )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{' '}
                {Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount}{' '}
                sessions
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Session Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Create Session"
        description="Schedule a new class session with an attendance window."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-session-form"
              loading={formLoading}
            >
              Create Session
            </Button>
          </>
        }
      >
        <form
          id="create-session-form"
          onSubmit={handleCreateSession}
          className="space-y-4"
        >
          <Select
            label="Batch"
            placeholder="Select a batch"
            required
            value={formData.batch_id}
            onChange={(e) =>
              setFormData((f) => ({ ...f, batch_id: e.target.value }))
            }
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select
            label="Classroom"
            placeholder="Select a classroom (optional)"
            value={formData.classroom_id}
            onChange={(e) =>
              setFormData((f) => ({ ...f, classroom_id: e.target.value }))
            }
          >
            <option value="">No classroom</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input
            label="Date"
            type="date"
            required
            value={formData.session_date}
            onChange={(e) =>
              setFormData((f) => ({ ...f, session_date: e.target.value }))
            }
          />
          <Input
            label="Notes"
            placeholder="e.g. Machine Learning - Lecture 5"
            value={formData.notes}
            onChange={(e) =>
              setFormData((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </form>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => {
          setCancelDialogOpen(false)
          setCancelSessionId(null)
        }}
        title="Cancel Session"
        description="Are you sure you want to cancel this session? This action cannot be undone."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false)
                setCancelSessionId(null)
              }}
            >
              Keep Session
            </Button>
            <Button
              variant="destructive"
              loading={cancelLoading}
              onClick={handleCancelSession}
            >
              Cancel Session
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-500">
          Cancelling a session will prevent students from marking attendance.
          This session will be marked as cancelled in all reports.
        </p>
      </Dialog>
    </div>
  )
}
