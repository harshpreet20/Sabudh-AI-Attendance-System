'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Clock,
  UserPlus,
  Ban,
  UserMinus,
} from 'lucide-react'
import type { StudentProfile, Batch } from '@/types/database'

const PAGE_SIZE = 12

export default function TeacherStudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<StudentProfile[]>([])
  const [pendingStudents, setPendingStudents] = useState<StudentProfile[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [search, setSearch] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null)
  const [tab, setTab] = useState<'active' | 'pending'>('active')
  const [processing, setProcessing] = useState<string | null>(null)

  const [approveDialog, setApproveDialog] = useState<StudentProfile | null>(null)
  const [assignBatch, setAssignBatch] = useState('')

  const [banDialog, setBanDialog] = useState<StudentProfile | null>(null)
  const [removeDialog, setRemoveDialog] = useState<StudentProfile | null>(null)

  const [addDialog, setAddDialog] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'active')
      .order('name')

    setBatches((myBatches as Batch[]) ?? [])
    const batchIds = myBatches?.map(b => b.id) ?? []

    const { data: pending } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    setPendingStudents((pending as StudentProfile[]) ?? [])

    if (batchIds.length === 0) {
      setStudents([])
      setTotal(0)
      setLoading(false)
      return
    }

    let query = supabase
      .from('student_profiles')
      .select('*', { count: 'exact' })
      .in('batch_id', batchFilter ? [batchFilter] : batchIds)
      .eq('status', 'active')
      .order('full_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`)
    }

    const { data, count } = await query
    setStudents((data as StudentProfile[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, batchFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(0)
  }, [search, batchFilter])

  async function handleApprove() {
    if (!approveDialog) return

    setProcessing(approveDialog.id)

    const updates: Record<string, unknown> = { status: 'active' }
    if (assignBatch) updates.batch_id = assignBatch

    const { error } = await supabase
      .from('student_profiles')
      .update(updates)
      .eq('id', approveDialog.id)

    if (error) {
      toast.error('Failed to approve student')
    } else {
      toast.success(`${approveDialog.full_name} approved`)
      setPendingStudents(prev => prev.filter(s => s.id !== approveDialog.id))
    }

    setProcessing(null)
    setApproveDialog(null)
    setAssignBatch('')
  }

  async function handleReject(student: StudentProfile) {
    setProcessing(student.id)

    const { error } = await supabase
      .from('student_profiles')
      .update({ status: 'suspended' })
      .eq('id', student.id)

    if (error) {
      toast.error('Failed to reject student')
    } else {
      toast.success(`${student.full_name} rejected`)
      setPendingStudents(prev => prev.filter(s => s.id !== student.id))
    }

    setProcessing(null)
  }

  async function handleBan() {
    if (!banDialog) return
    setProcessing(banDialog.id)

    const { error } = await supabase
      .from('student_profiles')
      .update({ status: 'suspended' })
      .eq('id', banDialog.id)

    if (error) {
      toast.error('Failed to ban student')
    } else {
      toast.success(`${banDialog.full_name} has been banned`)
      setStudents(prev => prev.filter(s => s.id !== banDialog.id))
      setTotal(prev => prev - 1)
    }

    setProcessing(null)
    setBanDialog(null)
  }

  async function handleRemove() {
    if (!removeDialog) return
    setProcessing(removeDialog.id)

    const { error } = await supabase
      .from('student_profiles')
      .update({ batch_id: null })
      .eq('id', removeDialog.id)

    if (error) {
      toast.error('Failed to remove student from batch')
    } else {
      toast.success(`${removeDialog.full_name} removed from batch`)
      setStudents(prev => prev.filter(s => s.id !== removeDialog.id))
      setTotal(prev => prev - 1)
    }

    setProcessing(null)
    setRemoveDialog(null)
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim() || !addEmail.trim()) {
      toast.error('Name and email are required')
      return
    }

    setAddLoading(true)

    try {
      const res = await fetch('/api/teacher/add-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: addName.trim(),
          email: addEmail.trim(),
          phone: addPhone.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to add student')
        return
      }

      toast.success('Student added. They will appear in Pending after email confirmation.')
      setAddDialog(false)
      setAddName('')
      setAddEmail('')
      setAddPhone('')
      fetchData()
    } catch {
      toast.error('Failed to add student')
    } finally {
      setAddLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-500">View and manage student profiles</p>
        </div>
        <Button onClick={() => setAddDialog(true)} size="sm">
          <UserPlus className="mr-1 h-4 w-4" />
          Add Student
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
            tab === 'active'
              ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
              : 'text-gray-600 hover:bg-white/50'
          }`}
        >
          Active Students
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'pending'
              ? 'bg-amber-500/10 text-amber-700 shadow-sm'
              : 'text-gray-600 hover:bg-white/50'
          }`}
        >
          <Clock className="h-4 w-4" />
          Pending Approval
          {pendingStudents.length > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
              {pendingStudents.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'active' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students found"
              description="No students match your current filters."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {students.map((student) => (
                  <Card
                    key={student.id}
                    className="cursor-pointer transition-all duration-200 hover:bg-white/70"
                    onClick={() => setSelectedStudent(selectedStudent?.id === student.id ? null : student)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <Avatar
                          src={student.profile_image_url}
                          fallback={student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-900">{student.full_name}</p>
                          <p className="truncate text-sm text-gray-500">{student.email}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={student.attendance_percentage >= 75 ? 'success' : student.attendance_percentage >= 50 ? 'warning' : 'destructive'}>
                              {student.attendance_percentage}% Attendance
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {selectedStudent?.id === student.id && (
                        <div className="mt-4 space-y-2 border-t border-white/30 pt-4 text-sm">
                          {[
                            ['Phone', student.phone],
                            ['City', student.city],
                            ['Profession', student.profession],
                            ['Qualification', student.qualification],
                            ['Organization', student.organization_name],
                            ['Learning Goal', student.learning_goal],
                            ['Present', `${student.present_count} / ${student.total_sessions}`],
                          ]
                            .filter(([, v]) => v)
                            .map(([label, value]) => (
                              <div key={label} className="flex justify-between">
                                <span className="text-gray-500">{label}</span>
                                <span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{value}</span>
                              </div>
                            ))}

                          <div className="flex gap-2 pt-3 border-t border-white/20">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={(e) => { e.stopPropagation(); setRemoveDialog(student) }}
                            >
                              <UserMinus className="mr-1 h-3.5 w-3.5" />
                              Remove
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="flex-1"
                              onClick={(e) => { e.stopPropagation(); setBanDialog(student) }}
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              Ban
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'pending' && (
        <>
          {pendingStudents.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No pending students"
              description="All student accounts have been reviewed."
            />
          ) : (
            <div className="space-y-3">
              {pendingStudents.map((student) => (
                <Card key={student.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar
                          fallback={student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          size="md"
                        />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{student.full_name}</p>
                          <p className="text-sm text-gray-500">{student.email}</p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                            {student.phone && <span>Phone: {student.phone}</span>}
                            {student.profession && <span>Profession: {student.profession}</span>}
                            {student.city && <span>City: {student.city}</span>}
                            <span>Applied: {new Date(student.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReject(student)}
                          loading={processing === student.id}
                          disabled={!!processing}
                        >
                          <UserX className="h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => { setApproveDialog(student); setAssignBatch('') }}
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
        </>
      )}

      {/* Approve + Assign Batch Dialog */}
      <Dialog
        open={!!approveDialog}
        onClose={() => { setApproveDialog(null); setAssignBatch('') }}
        title="Approve Student"
        description={approveDialog ? `Approve ${approveDialog.full_name} and assign to a batch` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setApproveDialog(null); setAssignBatch('') }}>Cancel</Button>
            <Button onClick={handleApprove} loading={!!processing}>
              <UserCheck className="h-4 w-4" />
              Approve
            </Button>
          </>
        }
      >
        <Select
          label="Assign to Batch (optional)"
          value={assignBatch}
          onChange={(e) => setAssignBatch(e.target.value)}
        >
          <option value="">No batch assignment</option>
          {batches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Dialog>

      {/* Ban Confirmation Dialog */}
      <Dialog
        open={!!banDialog}
        onClose={() => setBanDialog(null)}
        title="Ban Student"
        description={banDialog ? `Are you sure you want to ban ${banDialog.full_name}? They will not be able to access the platform until unbanned.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBanDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBan} loading={!!processing}>
              <Ban className="h-4 w-4" />
              Ban Student
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This will suspend the student&apos;s account. They will not be able to mark attendance or access course materials.
        </p>
      </Dialog>

      {/* Remove from Batch Dialog */}
      <Dialog
        open={!!removeDialog}
        onClose={() => setRemoveDialog(null)}
        title="Remove from Batch"
        description={removeDialog ? `Remove ${removeDialog.full_name} from their current batch?` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} loading={!!processing}>
              <UserMinus className="h-4 w-4" />
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          The student will be removed from their batch but their account will remain active. You can reassign them to a batch later.
        </p>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog
        open={addDialog}
        onClose={() => { setAddDialog(false); setAddName(''); setAddEmail(''); setAddPhone('') }}
        title="Add Student"
        description="Create a new student account. They will need teacher approval before accessing the platform."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAddDialog(false); setAddName(''); setAddEmail(''); setAddPhone('') }}>Cancel</Button>
            <Button onClick={handleAddStudent} loading={addLoading} disabled={!addName.trim() || !addEmail.trim()}>
              <UserPlus className="h-4 w-4" />
              Add Student
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Full Name *"
            placeholder="Rahul Sharma"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            required
          />
          <Input
            label="Email *"
            type="email"
            placeholder="rahul@example.com"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            required
          />
          <Input
            label="Phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            A password will be auto-generated and sent via email. The student will be in pending status until approved.
          </p>
        </div>
      </Dialog>
    </div>
  )
}
