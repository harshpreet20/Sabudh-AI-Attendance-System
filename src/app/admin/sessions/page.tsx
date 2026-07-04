'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Plus,
  Calendar,
  Clock,
  MoreHorizontal,
  Play,
  Square,
  CheckCircle,
  XCircle,
  Filter,
  Edit,
  Trash2,
  Upload,
  FileText,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
    attendance_open_time: '',
    attendance_close_time: '',
  })

  // Action dropdown
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // Cancel confirmation
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelSessionId, setCancelSessionId] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editSession, setEditSession] = useState<SessionWithRelations | null>(null)
  const [editFormData, setEditFormData] = useState({
    batch_id: '',
    classroom_id: '',
    session_date: '',
    notes: '',
    attendance_open_time: '',
    attendance_close_time: '',
  })
  const [editLoading, setEditLoading] = useState(false)

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Bulk import state
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importParsing, setImportParsing] = useState(false)
  const [importBatchId, setImportBatchId] = useState('')
  const [importTextMode, setImportTextMode] = useState(false)
  const [importRawText, setImportRawText] = useState('')
  const [parsedSessions, setParsedSessions] = useState<
    Array<{ date: string; notes: string; valid: boolean }>
  >([])
  const [importLoading, setImportLoading] = useState(false)

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
      if (status === 'attendance_open' || status === 'attendance_closed') {
        const action = status === 'attendance_open' ? 'open_attendance' : 'close_attendance'
        const res = await fetch(`/api/admin/sessions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const result = await res.json()
        if (!res.ok || !result.success) {
          throw new Error(result.error?.message || 'Failed to update session status')
        }
      } else {
        const { error } = await supabase
          .from('sessions')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      }
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

      const insertData: Record<string, unknown> = {
        batch_id: formData.batch_id,
        classroom_id: formData.classroom_id || null,
        instructor_id: user.id,
        session_date: formData.session_date,
        attendance_word: generateAttendanceWord(),
        status: 'scheduled',
        notes: formData.notes || null,
      }

      if (formData.attendance_open_time && formData.session_date) {
        insertData.attendance_open = new Date(`${formData.session_date}T${formData.attendance_open_time}`).toISOString()
      }
      if (formData.attendance_close_time && formData.session_date) {
        insertData.attendance_close = new Date(`${formData.session_date}T${formData.attendance_close_time}`).toISOString()
      }

      const { error } = await supabase.from('sessions').insert(insertData)

      if (error) throw error

      toast.success('Session created successfully')
      setDialogOpen(false)
      setFormData({
        batch_id: '',
        classroom_id: '',
        session_date: '',
        notes: '',
        attendance_open_time: '',
        attendance_close_time: '',
      })
      fetchSessions()
    } catch {
      toast.error('Failed to create session')
    } finally {
      setFormLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Edit session
  // ---------------------------------------------------------------------------

  function openEditDialog(session: SessionWithRelations) {
    setEditSession(session)
    setEditFormData({
      batch_id: session.batch_id,
      classroom_id: session.classroom_id || '',
      session_date: session.session_date,
      notes: session.notes || '',
      attendance_open_time: session.attendance_open
        ? format(new Date(session.attendance_open), 'HH:mm')
        : '',
      attendance_close_time: session.attendance_close
        ? format(new Date(session.attendance_close), 'HH:mm')
        : '',
    })
    setEditDialogOpen(true)
    setOpenDropdown(null)
  }

  async function handleEditSession(e: React.FormEvent) {
    e.preventDefault()
    if (!editSession) return
    setEditLoading(true)
    try {
      const updateData: Record<string, unknown> = {
        batch_id: editFormData.batch_id,
        classroom_id: editFormData.classroom_id || null,
        session_date: editFormData.session_date,
        notes: editFormData.notes || null,
        updated_at: new Date().toISOString(),
      }

      if (editFormData.attendance_open_time && editFormData.session_date) {
        updateData.attendance_open = new Date(`${editFormData.session_date}T${editFormData.attendance_open_time}`).toISOString()
      } else if (!editFormData.attendance_open_time) {
        updateData.attendance_open = null
      }

      if (editFormData.attendance_close_time && editFormData.session_date) {
        updateData.attendance_close = new Date(`${editFormData.session_date}T${editFormData.attendance_close_time}`).toISOString()
      } else if (!editFormData.attendance_close_time) {
        updateData.attendance_close = null
      }

      const { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', editSession.id)

      if (error) throw error

      toast.success('Session updated successfully')
      setEditDialogOpen(false)
      setEditSession(null)
      fetchSessions()
    } catch {
      toast.error('Failed to update session')
    } finally {
      setEditLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Delete session
  // ---------------------------------------------------------------------------

  async function handleDeleteSession() {
    if (!deleteSessionId) return
    setDeleteLoading(true)
    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', deleteSessionId)

      if (error) throw error

      toast.success('Session deleted successfully')
      fetchSessions()
    } catch {
      toast.error('Failed to delete session. It may have attendance records linked to it.')
    } finally {
      setDeleteLoading(false)
      setDeleteDialogOpen(false)
      setDeleteSessionId(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk import
  // ---------------------------------------------------------------------------

  function parseSessionLines(text: string): Array<{ date: string; notes: string; valid: boolean }> {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const results: Array<{ date: string; notes: string; valid: boolean }> = []

    const datePatterns = [
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
      /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/,
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i,
      /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
    ]

    for (const line of lines) {
      if (/^[-#=|*]+$/.test(line) || /^\|?\s*date/i.test(line)) continue

      let dateStr = ''
      let notes = line

      for (const pat of datePatterns) {
        const m = line.match(pat)
        if (m) {
          dateStr = m[1]
          notes = line.replace(m[0], '').replace(/^[\s,|:-]+|[\s,|:-]+$/g, '').trim()
          break
        }
      }

      if (!dateStr) continue

      const parsed = new Date(dateStr)
      let isoDate = ''
      let valid = false

      if (!isNaN(parsed.getTime())) {
        isoDate = parsed.toISOString().split('T')[0]
        valid = true
      } else {
        const parts = dateStr.split(/[-/]/)
        if (parts.length === 3) {
          const [a, b, c] = parts
          if (a.length === 4) {
            isoDate = `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`
          } else {
            isoDate = `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
          }
          const check = new Date(isoDate)
          valid = !isNaN(check.getTime())
        }
      }

      results.push({ date: isoDate || dateStr, notes: notes || '', valid })
    }

    return results
  }

  async function extractTextFromPdf(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, useSystemFonts: true }).promise
    const pages: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: Record<string, unknown>) => (item as { str: string }).str)
        .join(' ')
      pages.push(text)
    }

    return pages.join('\n')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportParsing(true)
    setImportTextMode(false)

    try {
      let text: string

      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPdf(file)
      } else {
        text = await file.text()
      }

      setImportRawText(text)
      const parsed = parseSessionLines(text)

      if (parsed.length === 0) {
        toast.error('No session dates found in the file. Try pasting content manually.')
        setImportTextMode(true)
      } else {
        setParsedSessions(parsed)
        toast.success(`Found ${parsed.length} session(s) in the file`)
      }
    } catch (err) {
      toast.error(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setImportTextMode(true)
    } finally {
      setImportParsing(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  function handleParseText() {
    const parsed = parseSessionLines(importRawText)
    if (parsed.length === 0) {
      toast.error('No session dates found. Each line should contain a date (YYYY-MM-DD) and optional notes.')
    } else {
      setParsedSessions(parsed)
      toast.success(`Found ${parsed.length} session(s)`)
    }
  }

  function removeFromParsed(index: number) {
    setParsedSessions(prev => prev.filter((_, i) => i !== index))
  }

  async function handleBulkImport() {
    if (!importBatchId) {
      toast.error('Please select a batch')
      return
    }

    const validSessions = parsedSessions.filter(s => s.valid)
    if (validSessions.length === 0) {
      toast.error('No valid sessions to import')
      return
    }

    setImportLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('You must be logged in')
        return
      }

      const rows = validSessions.map(s => ({
        batch_id: importBatchId,
        instructor_id: user.id,
        session_date: s.date,
        attendance_word: Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'scheduled' as const,
        notes: s.notes || null,
      }))

      const { error } = await supabase.from('sessions').insert(rows)

      if (error) throw error

      toast.success(`${validSessions.length} session(s) imported successfully`)
      setImportDialogOpen(false)
      setParsedSessions([])
      setImportRawText('')
      setImportBatchId('')
      setImportTextMode(false)
      fetchSessions()
    } catch {
      toast.error('Failed to import sessions')
    } finally {
      setImportLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Close dropdown on outside click
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleClickOutside() {
      setOpenDropdown(null)
      setDropdownPos(null)
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
          <Button
            variant="outline"
            onClick={() => {
              setImportDialogOpen(true)
              setParsedSessions([])
              setImportRawText('')
              setImportTextMode(false)
            }}
          >
            <Upload className="h-4 w-4" />
            Import Sessions
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
                        ? `${format(new Date(session.attendance_open), 'hh:mm a')} - ${format(new Date(session.attendance_close), 'hh:mm a')}`
                        : session.attendance_open
                          ? `${format(new Date(session.attendance_open), 'hh:mm a')} - ...`
                          : '--'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_MAP[session.status]}>
                        {STATUS_LABEL[session.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (openDropdown === session.id) {
                            setOpenDropdown(null)
                            setDropdownPos(null)
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setDropdownPos({ top: rect.bottom + 4, left: rect.right })
                            setOpenDropdown(session.id)
                          }
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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

      {/* Floating dropdown menu rendered outside table overflow */}
      {openDropdown && dropdownPos && (() => {
        const session = sessions.find(s => s.id === openDropdown)
        if (!session) return null
        return (
          <div
            className="fixed z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{ top: dropdownPos.top, left: dropdownPos.left - 192 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => openEditDialog(session)}
            >
              <Edit className="h-4 w-4" />
              Edit Session
            </button>

            {session.status === 'scheduled' && (
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                onClick={() => updateSessionStatus(session.id, 'attendance_open')}
              >
                <Play className="h-4 w-4" />
                Open Attendance
              </button>
            )}

            {session.status === 'attendance_open' && (
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                onClick={() => updateSessionStatus(session.id, 'attendance_closed')}
              >
                <Square className="h-4 w-4" />
                Close Attendance
              </button>
            )}

            {session.status === 'attendance_closed' && (
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
                onClick={() => updateSessionStatus(session.id, 'completed')}
              >
                <CheckCircle className="h-4 w-4" />
                Complete Session
              </button>
            )}

            {session.status !== 'cancelled' && session.status !== 'completed' && (
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                onClick={() => {
                  setCancelSessionId(session.id)
                  setCancelDialogOpen(true)
                  setOpenDropdown(null)
                  setDropdownPos(null)
                }}
              >
                <XCircle className="h-4 w-4" />
                Cancel Session
              </button>
            )}

            <div className="my-1 border-t border-gray-100" />
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={() => {
                setDeleteSessionId(session.id)
                setDeleteDialogOpen(true)
                setOpenDropdown(null)
                setDropdownPos(null)
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete Session
            </button>
          </div>
        )
      })()}

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
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Attendance Open Time"
              type="time"
              value={formData.attendance_open_time}
              onChange={(e) =>
                setFormData((f) => ({ ...f, attendance_open_time: e.target.value }))
              }
            />
            <Input
              label="Attendance Close Time"
              type="time"
              value={formData.attendance_close_time}
              onChange={(e) =>
                setFormData((f) => ({ ...f, attendance_close_time: e.target.value }))
              }
            />
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Optional. Pre-schedule when the attendance window opens and closes.
          </p>
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

      {/* Edit Session Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false)
          setEditSession(null)
        }}
        title="Edit Session"
        description="Update the session details below."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditSession(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-session-form"
              loading={editLoading}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form
          id="edit-session-form"
          onSubmit={handleEditSession}
          className="space-y-4"
        >
          <Select
            label="Batch"
            placeholder="Select a batch"
            required
            value={editFormData.batch_id}
            onChange={(e) =>
              setEditFormData((f) => ({ ...f, batch_id: e.target.value }))
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
            value={editFormData.classroom_id}
            onChange={(e) =>
              setEditFormData((f) => ({ ...f, classroom_id: e.target.value }))
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
            value={editFormData.session_date}
            onChange={(e) =>
              setEditFormData((f) => ({ ...f, session_date: e.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Attendance Open Time"
              type="time"
              value={editFormData.attendance_open_time}
              onChange={(e) =>
                setEditFormData((f) => ({ ...f, attendance_open_time: e.target.value }))
              }
            />
            <Input
              label="Attendance Close Time"
              type="time"
              value={editFormData.attendance_close_time}
              onChange={(e) =>
                setEditFormData((f) => ({ ...f, attendance_close_time: e.target.value }))
              }
            />
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Optional. Pre-schedule when the attendance window opens and closes.
          </p>
          <Input
            label="Notes"
            placeholder="e.g. Machine Learning - Lecture 5"
            value={editFormData.notes}
            onChange={(e) =>
              setEditFormData((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          setDeleteSessionId(null)
        }}
        title="Delete Session"
        description="Are you sure you want to permanently delete this session? This cannot be undone."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteSessionId(null)
              }}
            >
              Keep Session
            </Button>
            <Button
              variant="destructive"
              loading={deleteLoading}
              onClick={handleDeleteSession}
            >
              Delete Session
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-500">
          Deleting a session will permanently remove it and any associated attendance records.
          If you just want to mark it as inactive, consider cancelling it instead.
        </p>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => {
          setImportDialogOpen(false)
          setParsedSessions([])
          setImportRawText('')
          setImportTextMode(false)
        }}
        title="Import Sessions"
        description="Import multiple sessions from a file (PDF, TXT, MD, CSV) or paste text with dates."
      >
        <div className="space-y-4">
          <Select
            label="Batch *"
            value={importBatchId}
            onChange={(e) => setImportBatchId(e.target.value)}
          >
            <option value="">Select a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>

          {parsedSessions.length === 0 && (
            <>
              <div className="flex items-center gap-3">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".pdf,.txt,.md,.csv,.markdown"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => importFileRef.current?.click()}
                  disabled={importParsing}
                  className="flex-1"
                >
                  {importParsing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {importParsing ? 'Parsing...' : 'Choose File'}
                </Button>
                <span className="text-sm text-gray-400">or</span>
                <Button
                  variant="outline"
                  onClick={() => setImportTextMode(!importTextMode)}
                  className="flex-1"
                >
                  Paste Text
                </Button>
              </div>

              {importTextMode && (
                <div className="space-y-2">
                  <Textarea
                    label="Session dates (one per line)"
                    value={importRawText}
                    onChange={(e) => setImportRawText(e.target.value)}
                    rows={8}
                    placeholder={`2026-07-05 Introduction to ML\n2026-07-07 Linear Regression\n2026-07-10 Neural Networks Basics\n\nAccepted formats:\n- YYYY-MM-DD Optional notes\n- MM/DD/YYYY Optional notes\n- July 5, 2026 Optional notes`}
                  />
                  <Button onClick={handleParseText} disabled={!importRawText.trim()}>
                    Parse Dates
                  </Button>
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex gap-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Supported formats</p>
                    <p className="mt-1 text-amber-700">
                      Each line should contain a date. Supported: YYYY-MM-DD, MM/DD/YYYY,
                      &quot;July 5, 2026&quot;, &quot;5 Jul 2026&quot;. Text after the date becomes the session notes.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {parsedSessions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {parsedSessions.filter(s => s.valid).length} valid session(s) found
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setParsedSessions([]); setImportTextMode(false) }}
                >
                  Start Over
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedSessions.map((s, i) => (
                      <TableRow key={i} className={s.valid ? '' : 'bg-red-50'}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {!s.valid && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span className={s.valid ? 'text-gray-900' : 'text-red-600'}>
                              {s.date}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-500 line-clamp-1">
                            {s.notes || '--'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => removeFromParsed(i)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {parsedSessions.some(s => !s.valid) && (
                <p className="text-xs text-red-600">
                  Invalid dates will be skipped during import.
                </p>
              )}

              <Button
                onClick={handleBulkImport}
                loading={importLoading}
                disabled={!importBatchId || parsedSessions.filter(s => s.valid).length === 0}
                className="w-full"
              >
                Import {parsedSessions.filter(s => s.valid).length} Session(s)
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </div>
  )
}
