'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { StudentProfile, StudentStatus, Batch } from '@/types/database'
import { toast } from 'sonner'
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  UserX,
  UserCheck,
  Archive,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { suspendStudent, restoreStudent, archiveStudent } from './actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

type SortField = 'full_name' | 'attendance_percentage' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface StudentWithBatch extends StudentProfile {
  batches: { name: string } | null
  last_attendance_date: string | null
}

function getStatusBadgeVariant(
  status: StudentStatus
): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' {
  switch (status) {
    case 'active':
      return 'success'
    case 'pending':
      return 'warning'
    case 'suspended':
      return 'destructive'
    case 'expelled':
      return 'destructive'
    case 'archived':
      return 'secondary'
    default:
      return 'default'
  }
}

function getAttendanceColor(percentage: number): string {
  if (percentage >= 80) return 'text-green-700'
  if (percentage >= 60) return 'text-amber-700'
  return 'text-red-700'
}

function getAttendanceBgColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-50'
  if (percentage >= 60) return 'bg-amber-50'
  return 'bg-red-50'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// Client-side action wrappers (invoke server actions from a client component)
// ---------------------------------------------------------------------------

async function handleSuspend(studentId: string) {
  const result = await suspendStudent(studentId, 'Suspended by admin')
  if (!result.success) throw new Error(result.error)
}

async function handleRestore(studentId: string) {
  const result = await restoreStudent(studentId)
  if (!result.success) throw new Error(result.error)
}

async function handleArchive(studentId: string) {
  const result = await archiveStudent(studentId)
  if (!result.success) throw new Error(result.error)
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton shape="circle" className="h-10 w-10" />
          <Skeleton shape="line" className="h-4 w-40" />
          <Skeleton shape="line" className="hidden h-4 w-48 md:block" />
          <Skeleton shape="line" className="hidden h-4 w-24 lg:block" />
          <Skeleton shape="line" className="h-4 w-16" />
          <Skeleton shape="line" className="hidden h-4 w-20 sm:block" />
          <Skeleton shape="line" className="hidden h-4 w-28 lg:block" />
          <Skeleton shape="line" className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AdminStudentsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Data state
  const [students, setStudents] = useState<StudentWithBatch[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [batchFilter, setBatchFilter] = useState<string>('')
  const [attendanceFilter, setAttendanceFilter] = useState<string>('')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('full_name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Pagination state
  const [page, setPage] = useState(0)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
  }, [statusFilter, batchFilter, attendanceFilter])

  // Fetch batches on mount
  useEffect(() => {
    async function fetchBatches() {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('status', 'active')
        .order('name')

      if (error) {
        toast.error('Failed to load batches')
        return
      }
      setBatches(data ?? [])
    }
    fetchBatches()
  }, [supabase])

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('student_profiles')
        .select('*, batches(name)', { count: 'exact' })

      // Search filter
      if (debouncedSearch) {
        query = query.or(
          `full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`
        )
      }

      // Status filter
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      // Batch filter
      if (batchFilter) {
        query = query.eq('batch_id', batchFilter)
      }

      // Attendance range filter
      if (attendanceFilter) {
        switch (attendanceFilter) {
          case 'below_50':
            query = query.lt('attendance_percentage', 50)
            break
          case '50_75':
            query = query.gte('attendance_percentage', 50).lt('attendance_percentage', 75)
            break
          case '75_90':
            query = query.gte('attendance_percentage', 75).lt('attendance_percentage', 90)
            break
          case 'above_90':
            query = query.gte('attendance_percentage', 90)
            break
        }
      }

      // Sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' })

      // Pagination
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        toast.error('Failed to load students')
        return
      }

      // Fetch last attendance dates for the fetched students
      const studentIds = (data ?? []).map((s) => s.id)
      let lastAttendanceMap: Record<string, string> = {}

      if (studentIds.length > 0) {
        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('student_id, submitted_at')
          .in('student_id', studentIds)
          .order('submitted_at', { ascending: false })

        if (attendanceData) {
          for (const record of attendanceData) {
            if (record.student_id && !lastAttendanceMap[record.student_id]) {
              lastAttendanceMap[record.student_id] = record.submitted_at
            }
          }
        }
      }

      const studentsWithExtra: StudentWithBatch[] = (data ?? []).map((s) => ({
        ...s,
        batches: s.batches as { name: string } | null,
        last_attendance_date: lastAttendanceMap[s.id] ?? null,
      }))

      setStudents(studentsWithExtra)
      setTotalCount(count ?? 0)
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [
    supabase,
    debouncedSearch,
    statusFilter,
    batchFilter,
    attendanceFilter,
    sortField,
    sortDirection,
    page,
  ])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  // Sort handler
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Action handlers
  async function handleAction(
    action: (id: string) => Promise<void>,
    studentId: string,
    successMessage: string
  ) {
    setActionLoading(studentId)
    try {
      await action(studentId)
      toast.success(successMessage)
      fetchStudents()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Action failed'
      )
    } finally {
      setActionLoading(null)
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '--'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return '--'
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and monitor all student records
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {totalCount} student{totalCount !== 1 ? 's' : ''} total
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status filter */}
            <div className="w-full lg:w-44">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="expelled">Expelled</option>
                <option value="archived">Archived</option>
              </Select>
            </div>

            {/* Batch filter */}
            <div className="w-full lg:w-44">
              <Select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
              >
                <option value="">All Batches</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Attendance filter */}
            <div className="w-full lg:w-44">
              <Select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
              >
                <option value="">All Attendance</option>
                <option value="below_50">Below 50%</option>
                <option value="50_75">50% - 75%</option>
                <option value="75_90">75% - 90%</option>
                <option value="above_90">Above 90%</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students found"
              description={
                debouncedSearch || statusFilter || batchFilter || attendanceFilter
                  ? 'Try adjusting your search or filters'
                  : 'No student records available yet'
              }
              className="my-8"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>
                      <button
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                        onClick={() => handleSort('full_name')}
                      >
                        Name
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden lg:table-cell">Batch</TableHead>
                    <TableHead>
                      <button
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                        onClick={() => handleSort('attendance_percentage')}
                      >
                        Attendance
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <button
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                        onClick={() => handleSort('created_at')}
                      >
                        Last Attendance
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(`/admin/students/${student.id}`)
                      }
                    >
                      <TableCell>
                        <Avatar
                          src={student.profile_image_url}
                          alt={student.full_name}
                          fallback={getInitials(student.full_name)}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-gray-900">
                            {student.full_name}
                          </div>
                          <div className="text-xs text-gray-500 md:hidden">
                            {student.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-gray-600">{student.email}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-gray-600">
                          {student.batches?.name ?? '--'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-semibold ${getAttendanceColor(student.attendance_percentage)} ${getAttendanceBgColor(student.attendance_percentage)}`}
                        >
                          {student.attendance_percentage.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={getStatusBadgeVariant(student.status)}>
                          {student.status.charAt(0).toUpperCase() +
                            student.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-gray-600">
                        {formatDate(student.last_attendance_date)}
                      </TableCell>
                      <TableCell>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="relative"
                        >
                          <DropdownMenu
                            align="right"
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionLoading === student.id}
                                loading={actionLoading === student.id}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            }
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/admin/students/${student.id}`)
                              }
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(
                                  `/admin/students/${student.id}?edit=true`
                                )
                              }
                            >
                              <Edit className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {student.status === 'active' && (
                              <DropdownMenuItem
                                destructive
                                onClick={() =>
                                  handleAction(
                                    handleSuspend,
                                    student.id,
                                    'Student suspended successfully'
                                  )
                                }
                              >
                                <UserX className="h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            )}
                            {student.status === 'suspended' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleAction(
                                    handleRestore,
                                    student.id,
                                    'Student restored successfully'
                                  )
                                }
                              >
                                <UserCheck className="h-4 w-4" />
                                Restore
                              </DropdownMenuItem>
                            )}
                            {student.status !== 'archived' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleAction(
                                    handleArchive,
                                    student.id,
                                    'Student archived successfully'
                                  )
                                }
                              >
                                <Archive className="h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                  <p className="text-sm text-gray-500">
                    Showing {page * PAGE_SIZE + 1} to{' '}
                    {Math.min((page + 1) * PAGE_SIZE, totalCount)} of{' '}
                    {totalCount} students
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
