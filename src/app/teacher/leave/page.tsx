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
import { toast } from 'sonner'
import {
  CalendarOff,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import type { Batch } from '@/types/database'

interface LeaveWithStudent {
  id: string
  student_id: string
  batch_id: string
  leave_date: string
  reason: string
  status: string
  reviewer_note: string | null
  created_at: string
  student_name: string
}

export default function TeacherLeavePage() {
  const supabase = createClient()
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState('')
  const [requests, setRequests] = useState<LeaveWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [processing, setProcessing] = useState(false)

  const fetchBatches = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')

    setBatches((data as Batch[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  useEffect(() => {
    if (!selectedBatch) return

    async function fetchRequests() {
      setLoadingRequests(true)

      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('id, student_id, batch_id, leave_date, reason, status, reviewer_note, created_at')
        .eq('batch_id', selectedBatch)
        .order('created_at', { ascending: false })

      if (!leaves || leaves.length === 0) {
        setRequests([])
        setLoadingRequests(false)
        return
      }

      const studentIds = [...new Set(leaves.map(l => l.student_id))]
      const { data: students } = await supabase
        .from('student_profiles')
        .select('id, full_name')
        .in('id', studentIds)

      const nameMap = new Map(students?.map(s => [s.id, s.full_name]) ?? [])

      setRequests(leaves.map(l => ({
        ...l,
        student_name: nameMap.get(l.student_id) ?? 'Unknown',
      })))
      setLoadingRequests(false)
    }

    fetchRequests()
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

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
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status, reviewer_note: reviewNote || null } : r))
      setReviewId(null)
      setReviewNote('')
    }
    setProcessing(false)
  }

  if (loading) {
    return <Skeleton className="h-96" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
        <p className="mt-1 text-sm text-gray-500">Review and manage student leave applications</p>
      </div>

      <Select
        label="Select Batch"
        value={selectedBatch}
        onChange={(e) => setSelectedBatch(e.target.value)}
      >
        <option value="">Select a batch</option>
        {batches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </Select>

      {!selectedBatch && (
        <EmptyState
          icon={CalendarOff}
          title="Select a batch"
          description="Choose a batch to view leave requests."
        />
      )}

      {selectedBatch && loadingRequests && <Skeleton className="h-64" />}

      {selectedBatch && !loadingRequests && requests.length === 0 && (
        <EmptyState
          icon={CalendarOff}
          title="No leave requests"
          description="No students have applied for leave in this batch."
        />
      )}

      {selectedBatch && !loadingRequests && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {req.status === 'approved' ? (
                      <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
                    ) : req.status === 'rejected' ? (
                      <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
                    ) : (
                      <Clock className="mt-0.5 h-5 w-5 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{req.student_name}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(req.leave_date).toLocaleDateString('en-IN', {
                          weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">{req.reason}</p>
                      {req.reviewer_note && (
                        <p className="mt-1 text-xs text-gray-400">Note: {req.reviewer_note}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {req.status === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setReviewId(req.id); setReviewNote('') }}
                        >
                          Review
                        </Button>
                      </>
                    ) : (
                      <Badge variant={req.status === 'approved' ? 'success' : 'destructive'}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog
        open={!!reviewId}
        onClose={() => setReviewId(null)}
        title="Review Leave Request"
        description="Approve or reject this leave request"
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
