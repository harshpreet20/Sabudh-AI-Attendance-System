'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import {
  CalendarOff,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
} from 'lucide-react'
import type { LeaveRequest } from '@/types/database'

export default function LeavePage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leaveDate, setLeaveDate] = useState('')
  const [reason, setReason] = useState('')
  const [studentId, setStudentId] = useState('')
  const [batchId, setBatchId] = useState('')

  const fetchLeaves = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      setLoading(false)
      return
    }

    setStudentId(profile.id)
    setBatchId(profile.batch_id || '')

    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })

    setRequests((data as LeaveRequest[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLeaves()
  }, [fetchLeaves])

  async function handleSubmit() {
    if (!leaveDate || !reason.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    if (!batchId) {
      toast.error('You must be assigned to a batch to apply for leave')
      return
    }

    setSubmitting(true)

    const { error } = await supabase
      .from('leave_requests')
      .insert({
        student_id: studentId,
        batch_id: batchId,
        leave_date: leaveDate,
        reason: reason.trim(),
      })

    if (error) {
      toast.error('Failed to submit leave request')
    } else {
      toast.success('Leave request submitted successfully')
      setShowDialog(false)
      setLeaveDate('')
      setReason('')
      fetchLeaves()
    }

    setSubmitting(false)
  }

  async function handleWithdraw(id: string) {
    const { error } = await supabase.from('leave_requests').delete().eq('id', id)
    if (error) {
      toast.error('Failed to withdraw request')
    } else {
      toast.success('Leave request withdrawn')
      setRequests((prev) => prev.filter((r) => r.id !== id))
    }
  }

  function statusIcon(status: string) {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Clock className="h-4 w-4 text-amber-500" />
    }
  }

  function statusVariant(status: string): 'success' | 'destructive' | 'warning' {
    switch (status) {
      case 'approved': return 'success'
      case 'rejected': return 'destructive'
      default: return 'warning'
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Applications</h1>
          <p className="mt-1 text-sm text-gray-500">Apply for leave and track your requests</p>
        </div>
        <Button onClick={() => setShowDialog(true)} disabled={!batchId}>
          <Plus className="h-4 w-4" />
          Apply Leave
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-amber-100/60 p-3">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {requests.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-sm text-gray-500">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-emerald-100/60 p-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {requests.filter(r => r.status === 'approved').length}
              </p>
              <p className="text-sm text-gray-500">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-red-100/60 p-3">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {requests.filter(r => r.status === 'rejected').length}
              </p>
              <p className="text-sm text-gray-500">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leave Requests List */}
      {requests.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No leave requests"
          description="You haven't applied for any leave yet. Click 'Apply Leave' to submit a request."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-start gap-4">
                  {statusIcon(req.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(req.leave_date).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{req.reason}</p>
                    {req.reviewer_note && (
                      <p className="mt-1 text-xs text-gray-400">
                        Note: {req.reviewer_note}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      Applied {new Date(req.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {req.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500 hover:text-red-700"
                      onClick={() => handleWithdraw(req.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />Withdraw
                    </Button>
                  )}
                  <Badge variant={statusVariant(req.status)}>
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Apply Leave Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title="Apply for Leave"
        description="Submit a leave request for a specific date"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>Submit Request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Leave Date"
            type="date"
            value={leaveDate}
            onChange={(e) => setLeaveDate(e.target.value)}
            min={today}
          />
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please explain the reason for your leave..."
            rows={4}
          />
        </div>
      </Dialog>
    </div>
  )
}
