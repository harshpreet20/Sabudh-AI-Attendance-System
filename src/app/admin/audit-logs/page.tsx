'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FileText, Filter, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
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
import type { AuditLog } from '@/types/database'

const PAGE_SIZE = 20
const EXPORT_CAP = 5000

const ACTION_LABELS: Record<string, string> = {
  student_suspended: 'Student Suspended',
  student_restored: 'Student Restored',
  student_expelled: 'Student Expelled',
  student_archived: 'Student Archived',
  student_profile_updated: 'Profile Updated',
  update_profile: 'Profile Updated',
  suspend: 'Student Suspended',
  restore: 'Student Restored',
  expel: 'Student Expelled',
  archive: 'Student Archived',
}

function getActionBadgeVariant(action: string): 'default' | 'success' | 'warning' | 'destructive' | 'secondary' {
  if (action.includes('suspend') || action.includes('expel')) return 'destructive'
  if (action.includes('restore')) return 'success'
  if (action.includes('update') || action.includes('archive')) return 'warning'
  return 'secondary'
}

type NameMap = Record<string, string>

async function resolveNames(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<NameMap> {
  if (ids.length === 0) return {}
  const map: NameMap = {}

  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, auth_user_id, full_name')
    .in('auth_user_id', ids)

  if (students) {
    for (const s of students) {
      if (s.auth_user_id && s.full_name) map[s.auth_user_id] = s.full_name
    }
  }

  const remaining = ids.filter((id) => !map[id])
  if (remaining.length > 0) {
    const { data: teachers } = await supabase
      .from('teacher_profiles')
      .select('id, auth_user_id, full_name')
      .in('auth_user_id', remaining)

    if (teachers) {
      for (const t of teachers) {
        if (t.auth_user_id && t.full_name) map[t.auth_user_id] = t.full_name
      }
    }
  }

  const targetOnlyIds = ids.filter((id) => !map[id])
  if (targetOnlyIds.length > 0) {
    const { data: studentsById } = await supabase
      .from('student_profiles')
      .select('id, full_name')
      .in('id', targetOnlyIds)

    if (studentsById) {
      for (const s of studentsById) {
        if (s.id && s.full_name) map[s.id] = s.full_name
      }
    }
  }

  return map
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export default function AuditLogsPage() {
  const supabase = createClient()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [nameMap, setNameMap] = useState<NameMap>({})
  const [exporting, setExporting] = useState(false)

  const [showFilters, setShowFilters] = useState(false)
  const [filterAction, setFilterAction] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStudentName, setFilterStudentName] = useState('')

  const studentNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedStudentName, setDebouncedStudentName] = useState('')

  useEffect(() => {
    if (studentNameDebounceRef.current) clearTimeout(studentNameDebounceRef.current)
    studentNameDebounceRef.current = setTimeout(() => {
      setDebouncedStudentName(filterStudentName.trim())
      setPage(0)
    }, 400)
    return () => {
      if (studentNameDebounceRef.current) clearTimeout(studentNameDebounceRef.current)
    }
  }, [filterStudentName])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let matchingTargetIds: string[] | undefined
      if (debouncedStudentName) {
        const { data: matchedStudents } = await supabase
          .from('student_profiles')
          .select('id, auth_user_id')
          .ilike('full_name', `%${debouncedStudentName}%`)

        if (!matchedStudents || matchedStudents.length === 0) {
          setLogs([])
          setTotalCount(0)
          setNameMap({})
          setLoading(false)
          return
        }
        matchingTargetIds = matchedStudents.flatMap((s) =>
          [s.id, s.auth_user_id].filter(Boolean) as string[]
        )
      }

      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filterAction) query = query.eq('action', filterAction)
      if (filterTable) query = query.eq('target_table', filterTable)
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom)
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`)
      if (matchingTargetIds) query = query.in('target_id', matchingTargetIds)

      const { data, count, error } = await query
      if (error) throw error

      const fetched = (data as AuditLog[]) ?? []
      setLogs(fetched)
      setTotalCount(count ?? 0)

      const allIds = new Set<string>()
      for (const log of fetched) {
        if (log.actor_id) allIds.add(log.actor_id)
        if (log.target_id) allIds.add(log.target_id)
      }
      const resolved = await resolveNames(supabase, Array.from(allIds))
      setNameMap(resolved)
    } catch {
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, filterAction, filterTable, filterDateFrom, filterDateTo, debouncedStudentName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  async function handleExportCsv() {
    setExporting(true)
    try {
      let matchingTargetIds: string[] | undefined
      if (debouncedStudentName) {
        const { data: matchedStudents } = await supabase
          .from('student_profiles')
          .select('id, auth_user_id')
          .ilike('full_name', `%${debouncedStudentName}%`)

        if (!matchedStudents || matchedStudents.length === 0) {
          toast.error('No logs match the current filters')
          setExporting(false)
          return
        }
        matchingTargetIds = matchedStudents.flatMap((s) =>
          [s.id, s.auth_user_id].filter(Boolean) as string[]
        )
      }

      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(EXPORT_CAP)

      if (filterAction) query = query.eq('action', filterAction)
      if (filterTable) query = query.eq('target_table', filterTable)
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom)
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`)
      if (matchingTargetIds) query = query.in('target_id', matchingTargetIds)

      const { data, error } = await query
      if (error) throw error

      const allLogs = (data as AuditLog[]) ?? []
      if (allLogs.length === 0) {
        toast.error('No logs match the current filters')
        setExporting(false)
        return
      }

      const exportIds = new Set<string>()
      for (const log of allLogs) {
        if (log.actor_id) exportIds.add(log.actor_id)
        if (log.target_id) exportIds.add(log.target_id)
      }
      const exportNameMap = await resolveNames(supabase, Array.from(exportIds))

      const headers = ['Timestamp', 'Action', 'Target Table', 'Target ID', 'Target Name', 'Reason', 'Actor ID', 'Actor Name']
      const rows = allLogs.map((log) => [
        log.created_at,
        ACTION_LABELS[log.action] || log.action,
        log.target_table || '',
        log.target_id || '',
        (log.target_id && exportNameMap[log.target_id]) || '',
        log.reason || '',
        log.actor_id || '',
        (log.actor_id && exportNameMap[log.actor_id]) || '',
      ])

      const csvContent = [
        headers.map(escapeCsvField).join(','),
        ...rows.map((row) => row.map(escapeCsvField).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const today = new Date().toISOString().split('T')[0]
      link.href = url
      link.download = `audit-logs-${today}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${allLogs.length} log entries`)
    } catch {
      toast.error('Failed to export audit logs')
    } finally {
      setExporting(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function renderTargetCell(log: AuditLog) {
    if (!log.target_table) return null

    const resolvedName = log.target_id ? nameMap[log.target_id] : undefined
    const isStudentLink = log.target_table === 'student_profiles' && log.target_id

    const content = (
      <span>
        {log.target_table}
        {resolvedName ? (
          <span className="ml-1 text-gray-900 font-medium">
            {resolvedName}
            {log.target_id && (
              <span className="ml-1 font-mono text-xs text-gray-400" title={log.target_id}>
                ({log.target_id.slice(0, 8)})
              </span>
            )}
          </span>
        ) : log.target_id ? (
          <span className="ml-1 font-mono text-xs text-gray-400" title={log.target_id}>
            {log.target_id.slice(0, 8)}
          </span>
        ) : null}
      </span>
    )

    if (isStudentLink) {
      return (
        <Link
          href={`/admin/students/${log.target_id}`}
          className="text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          {content}
        </Link>
      )
    }

    return content
  }

  function renderActorCell(log: AuditLog) {
    if (!log.actor_id) return '--'
    const resolvedName = nameMap[log.actor_id]
    if (resolvedName) {
      return (
        <span title={log.actor_id}>
          <span className="text-sm text-gray-700">{resolvedName}</span>
          <span className="ml-1 font-mono text-xs text-gray-400">
            ({log.actor_id.slice(0, 8)})
          </span>
        </span>
      )
    }
    return (
      <span className="font-mono text-xs text-gray-400" title={log.actor_id}>
        {log.actor_id.slice(0, 8)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track all administrative actions and changes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={exporting}
            onClick={handleExportCsv}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Action"
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value)
                setPage(0)
              }}
            >
              <option value="">All Actions</option>
              <option value="student_suspended">Student Suspended</option>
              <option value="student_restored">Student Restored</option>
              <option value="student_expelled">Student Expelled</option>
              <option value="student_archived">Student Archived</option>
              <option value="student_profile_updated">Profile Updated</option>
            </Select>
            <Select
              label="Target Table"
              value={filterTable}
              onChange={(e) => {
                setFilterTable(e.target.value)
                setPage(0)
              }}
            >
              <option value="">All Tables</option>
              <option value="student_profiles">Student Profiles</option>
              <option value="sessions">Sessions</option>
              <option value="attendance">Attendance</option>
              <option value="certificates">Certificates</option>
            </Select>
            <Input
              label="Student Name"
              type="text"
              placeholder="Search by name..."
              value={filterStudentName}
              onChange={(e) => setFilterStudentName(e.target.value)}
            />
            <Input
              label="Date from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value)
                setPage(0)
              }}
            />
            <Input
              label="Date to"
              type="date"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value)
                setPage(0)
              }}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterAction('')
                setFilterTable('')
                setFilterDateFrom('')
                setFilterDateTo('')
                setFilterStudentName('')
                setPage(0)
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} shape="rect" height={56} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No audit logs found"
          description="There are no audit logs matching your filters."
        />
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-gray-600">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {renderTargetCell(log)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-gray-500">
                      {log.reason || '--'}
                    </TableCell>
                    <TableCell>
                      {renderActorCell(log)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1} to{' '}
                {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}{' '}
                entries
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
    </div>
  )
}
