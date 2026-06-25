'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { FileText, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
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

export default function AuditLogsPage() {
  const supabase = createClient()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  const [showFilters, setShowFilters] = useState(false)
  const [filterAction, setFilterAction] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filterAction) query = query.eq('action', filterAction)
      if (filterTable) query = query.eq('target_table', filterTable)
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom)
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`)

      const { data, count, error } = await query
      if (error) throw error

      setLogs((data as AuditLog[]) ?? [])
      setTotalCount(count ?? 0)
    } catch {
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, filterAction, filterTable, filterDateFrom, filterDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  <TableHead>Actor ID</TableHead>
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
                      {log.target_table && (
                        <span>
                          {log.target_table}
                          {log.target_id && (
                            <span className="ml-1 font-mono text-xs text-gray-400">
                              {log.target_id.slice(0, 8)}
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-gray-500">
                      {log.reason || '--'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-400">
                      {log.actor_id?.slice(0, 8) || '--'}
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
