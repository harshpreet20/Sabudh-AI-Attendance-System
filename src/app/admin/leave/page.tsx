'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  CalendarOff,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
} from 'lucide-react'
import type { Batch } from '@/types/database'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

interface LeaveWithDetails {
  id: string
  student_id: string
  batch_id: string
  leave_date: string
  reason: string
  status: string
  reviewer_note: string | null
  reviewed_at: string | null
  created_at: string
  student_name: string
  batch_name: string
}

export default function AdminLeavePage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<LeaveWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [processing, setProcessing] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('leave_requests')
      .select('id, student_id, batch_id, leave_date, reason, status, reviewer_note, reviewed_at, created_at')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data: leaves } = await query

    if (!leaves || leaves.length === 0) {
      setRequests([])
      setLoading(false)
      return
    }

    const studentIds = [...new Set(leaves.map(l => l.student_id))]
    const batchIds = [...new Set(leaves.map(l => l.batch_id))]

    const [studentsResult, batchesResult] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('id, full_name')
        .in('id', studentIds),
      supabase
        .from('batches')
        .select('id, name')
        .in('id', batchIds),
    ])

    const nameMap = new Map(studentsResult.data?.map(s => [s.id, s.full_name]) ?? [])
    const batchMap = new Map(batchesResult.data?.map(b => [b.id, b.name]) ?? [])

    const enriched: LeaveWithDetails[] = leaves.map(l => ({
      ...l,
      student_name: nameMap.get(l.student_id) ?? 'Unknown',
      batch_name: batchMap.get(l.batch_id) ?? 'Unknown',
    }))

    setRequests(enriched)
    setLoading(false)
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  async function handleReview(id: string, status: 'approved' | 'rejected') {
    setProcessing(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_note: reviewNote || null,
      })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update leave request')
    } else {
      toast.success(`Leave request ${status}`)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status, reviewer_note: reviewNote || null, reviewed_at: new Date().toISOString() } : r))
      setReviewId(null)
      setReviewNote('')
    }
    setProcessing(false)
  }

  const filteredRequests = requests.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return r.student_name.toLowerCase().includes(q)
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const approvedCount = requests.filter(r => r.status === 'approved').length
  const rejectedCount = requests.filter(r => r.status === 'rejected').length
  const totalCount = requests.length

  const reviewTarget = reviewId ? requests.find(r => r.id === reviewId) : null

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-amber-500" />
    }
  }

  function getStatusVariant(status: string) {
    switch (status) {
      case 'approved':
        return 'success' as const
      case 'rejected':
        return 'destructive' as const
      case 'pending':
        return 'warning' as const
      default:
        return 'secondary' as const
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="mt-1 text-sm text-gray-500">Review and manage all student leave applications</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} shape="rect" className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Review and manage all student leave applications across all batches</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gray-100/60 p-2 backdrop-blur-sm">
                <CalendarOff className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
                <p className="text-xs text-gray-500">Total Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100/60 p-2 backdrop-blur-sm">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100/60 p-2 backdrop-blur-sm">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
                <p className="text-xs text-gray-500">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-100/60 p-2 backdrop-blur-sm">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
                <p className="text-xs text-gray-500">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100/60 p-1.5 backdrop-blur-sm">
              <Filter className="h-5 w-5 text-indigo-600" />
            </div>
            All Leave Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No leave requests"
              description={searchQuery.trim()
                ? 'No leave requests match your search criteria.'
                : statusFilter !== 'all'
                  ? `No ${statusFilter} leave requests found.`
                  : 'No leave requests have been submitted yet.'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Leave Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <p className="text-sm font-semibold text-gray-900">{req.student_name}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700">{req.batch_name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700">
                        {new Date(req.leave_date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-xs truncate text-sm text-gray-600" title={req.reason}>
                        {req.reason}
                      </p>
                      {req.reviewer_note && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400" title={req.reviewer_note}>
                          Note: {req.reviewer_note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(req.status)}
                        <Badge variant={getStatusVariant(req.status)}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-500">
                        {new Date(req.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      {req.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setReviewId(req.id); setReviewNote('') }}
                        >
                          Review
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {req.reviewed_at
                            ? new Date(req.reviewed_at).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '--'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog
        open={!!reviewId}
        onClose={() => setReviewId(null)}
        title="Review Leave Request"
        description={reviewTarget
          ? `${reviewTarget.student_name} - ${new Date(reviewTarget.leave_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}`
          : 'Approve or reject this leave request'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => reviewId && handleReview(reviewId, 'rejected')}
              loading={processing}
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={() => reviewId && handleReview(reviewId, 'approved')}
              loading={processing}
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </Button>
          </>
        }
      >
        {reviewTarget && (
          <div className="mb-4 space-y-2 rounded-xl bg-gray-50/60 border border-gray-200/50 p-3 text-sm backdrop-blur-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Student</span>
              <span className="font-medium text-gray-900">{reviewTarget.student_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Batch</span>
              <span className="font-medium text-gray-900">{reviewTarget.batch_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">
                {new Date(reviewTarget.leave_date).toLocaleDateString('en-IN', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Reason</span>
              <p className="mt-1 text-gray-900">{reviewTarget.reason}</p>
            </div>
          </div>
        )}
        <Textarea
          label="Note (optional)"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Add a note for the student..."
          rows={3}
        />
      </Dialog>
    </div>
  )
}
