'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  UserCheck,
  UserX,
  Clock,
  GraduationCap,
  Users,
  ShieldCheck,
} from 'lucide-react'
import type { Batch } from '@/types/database'

interface PendingUser {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  phone: string | null
  type: 'student' | 'teacher'
  created_at: string
  profession?: string | null
  qualification?: string | null
  city?: string | null
  subject_expertise?: string | null
  bio?: string | null
}

export default function AdminApprovalsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'students' | 'teachers'>('all')

  // Assign batch dialog
  const [assignDialog, setAssignDialog] = useState<PendingUser | null>(null)
  const [selectedBatch, setSelectedBatch] = useState('')

  const fetchPending = useCallback(async () => {
    const [{ data: students }, { data: teachers }, { data: batchData }] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('id, auth_user_id, full_name, email, phone, profession, qualification, city, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('teacher_profiles')
        .select('id, auth_user_id, full_name, email, phone, subject_expertise, qualification, bio, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('batches')
        .select('*')
        .eq('status', 'active')
        .order('name'),
    ])

    const pending: PendingUser[] = [
      ...(students ?? []).map(s => ({ ...s, type: 'student' as const })),
      ...(teachers ?? []).map(t => ({ ...t, type: 'teacher' as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setPendingUsers(pending)
    setBatches((batchData as Batch[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  async function approveStudent(user: PendingUser) {
    setAssignDialog(user)
  }

  async function confirmApproveStudent() {
    if (!assignDialog) return

    setProcessing(assignDialog.id)

    const updates: Record<string, unknown> = { status: 'active' }
    if (selectedBatch) {
      updates.batch_id = selectedBatch
    }

    const { error } = await supabase
      .from('student_profiles')
      .update(updates)
      .eq('id', assignDialog.id)

    if (error) {
      toast.error('Failed to approve student')
    } else {
      toast.success(`${assignDialog.full_name} has been approved`)
      setPendingUsers(prev => prev.filter(u => u.id !== assignDialog.id))

      const batchName = selectedBatch ? batches.find(b => b.id === selectedBatch)?.name : undefined
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'approval_notification',
          studentEmail: assignDialog.email,
          studentName: assignDialog.full_name,
          status: 'approved',
          batchName,
        }),
      }).catch(() => {})
    }

    setProcessing(null)
    setAssignDialog(null)
    setSelectedBatch('')
  }

  async function approveTeacher(user: PendingUser) {
    setProcessing(user.id)

    const { error } = await supabase
      .from('teacher_profiles')
      .update({ status: 'active' })
      .eq('id', user.id)

    if (error) {
      toast.error('Failed to approve teacher')
    } else {
      toast.success(`${user.full_name} has been approved as a teacher`)
      setPendingUsers(prev => prev.filter(u => u.id !== user.id))

      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'approval_notification',
          studentEmail: user.email,
          studentName: user.full_name,
          status: 'approved',
        }),
      }).catch(() => {})
    }

    setProcessing(null)
  }

  async function rejectUser(user: PendingUser) {
    setProcessing(user.id)

    const table = user.type === 'teacher' ? 'teacher_profiles' : 'student_profiles'
    const { error } = await supabase
      .from(table)
      .update({ status: user.type === 'teacher' ? 'inactive' : 'suspended' })
      .eq('id', user.id)

    if (error) {
      toast.error('Failed to reject account')
    } else {
      toast.success(`${user.full_name} has been rejected`)
      setPendingUsers(prev => prev.filter(u => u.id !== user.id))

      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'approval_notification',
          studentEmail: user.email,
          studentName: user.full_name,
          status: 'rejected',
        }),
      }).catch(() => {})
    }

    setProcessing(null)
  }

  const filtered = tab === 'all'
    ? pendingUsers
    : pendingUsers.filter(u => u.type === (tab === 'students' ? 'student' : 'teacher'))

  const studentCount = pendingUsers.filter(u => u.type === 'student').length
  const teacherCount = pendingUsers.filter(u => u.type === 'teacher').length

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">Review and approve new teacher and student accounts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-amber-100/60 p-3">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pendingUsers.length}</p>
              <p className="text-sm text-gray-500">Total Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-indigo-100/60 p-3">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{studentCount}</p>
              <p className="text-sm text-gray-500">Pending Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-violet-100/60 p-3">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{teacherCount}</p>
              <p className="text-sm text-gray-500">Pending Teachers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['all', 'students', 'teachers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
              tab === t
                ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            {t === 'all' ? 'All' : t === 'students' ? `Students (${studentCount})` : `Teachers (${teacherCount})`}
          </button>
        ))}
      </div>

      {/* Pending Users List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No pending approvals"
          description="All accounts have been reviewed. New sign-ups will appear here."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar
                      fallback={user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      size="md"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{user.full_name}</p>
                        <Badge variant={user.type === 'teacher' ? 'default' : 'secondary'}>
                          {user.type === 'teacher' ? 'Teacher' : 'Student'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                        {user.phone && <span>Phone: {user.phone}</span>}
                        {user.type === 'student' && user.profession && <span>Profession: {user.profession}</span>}
                        {user.type === 'student' && user.city && <span>City: {user.city}</span>}
                        {user.type === 'teacher' && user.subject_expertise && <span>Expertise: {user.subject_expertise}</span>}
                        {user.qualification && <span>Qualification: {user.qualification}</span>}
                        <span>Applied: {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => rejectUser(user)}
                      loading={processing === user.id}
                      disabled={!!processing}
                    >
                      <UserX className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => user.type === 'teacher' ? approveTeacher(user) : approveStudent(user)}
                      loading={processing === user.id}
                      disabled={!!processing}
                    >
                      <UserCheck className="h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assign Batch Dialog (for students) */}
      <Dialog
        open={!!assignDialog}
        onClose={() => { setAssignDialog(null); setSelectedBatch('') }}
        title="Approve Student"
        description={assignDialog ? `Approve ${assignDialog.full_name} and optionally assign to a batch` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAssignDialog(null); setSelectedBatch('') }}>Cancel</Button>
            <Button onClick={confirmApproveStudent} loading={!!processing}>
              <UserCheck className="h-4 w-4" />
              Approve
            </Button>
          </>
        }
      >
        <Select
          label="Assign to Batch (optional)"
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
        >
          <option value="">No batch assignment</option>
          {batches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Dialog>
    </div>
  )
}
