'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  UserPlus,
  GraduationCap,
  ShieldCheck,
  CheckCircle,
  Copy,
  Search,
  Users,
  Trash2,
  UserCheck,
  Ban,
  ChevronLeft,
  ChevronRight,
  Mail,
} from 'lucide-react'
import type { TeacherProfile, Batch } from '@/types/database'

type UserType = 'student' | 'teacher'
type StatusFilter = 'all' | 'active' | 'pending' | 'suspended'

interface DisplayTeacher {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  phone: string | null
  status: string
  profile_image_url: string | null
  created_at: string
}

const PAGE_SIZE = 15

function getStatusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success' as const
    case 'pending':
      return 'warning' as const
    case 'suspended':
    case 'inactive':
      return 'destructive' as const
    default:
      return 'secondary' as const
  }
}

export default function AdminUsersPage() {
  const supabase = createClient()

  // Add User form state
  const [tab, setTab] = useState<UserType>('student')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [batchId, setBatchId] = useState('')
  const [qualification, setQualification] = useState('')
  const [city, setCity] = useState('')
  const [profession, setProfession] = useState('')
  const [subjectExpertise, setSubjectExpertise] = useState('')

  const [result, setResult] = useState<{ email: string; password: string; type: string } | null>(null)

  // Teacher list state
  const [teachers, setTeachers] = useState<DisplayTeacher[]>([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<DisplayTeacher | null>(null)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false)
  const [bulkStatusDialog, setBulkStatusDialog] = useState<'active' | 'suspended' | null>(null)

  const fetchBatches = useCallback(async () => {
    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')
    setBatches((data as Batch[]) ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTeachers = useCallback(async () => {
    setTeachersLoading(true)
    setSelectedIds(new Set())

    let query = supabase
      .from('teacher_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (statusFilter !== 'all') {
      const dbStatus = statusFilter === 'suspended' ? 'inactive' : statusFilter
      query = query.eq('status', dbStatus)
    }

    if (searchQuery.trim()) {
      query = query.or(`full_name.ilike.%${searchQuery.trim()}%,email.ilike.%${searchQuery.trim()}%`)
    }

    const { data, count } = await query

    const mapped: DisplayTeacher[] = ((data ?? []) as TeacherProfile[]).map((u) => ({
      id: u.id,
      auth_user_id: u.auth_user_id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      profile_image_url: u.profile_image_url,
      created_at: u.created_at,
    }))

    setTeachers(mapped)
    setTotal(count ?? 0)
    setTeachersLoading(false)
  }, [page, statusFilter, searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  useEffect(() => {
    fetchTeachers()
  }, [fetchTeachers])

  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
  }, [searchQuery, statusFilter])

  function resetForm() {
    setFullName('')
    setEmail('')
    setPhone('')
    setBatchId('')
    setQualification('')
    setCity('')
    setProfession('')
    setSubjectExpertise('')
    setResult(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) {
      toast.error('Name and email are required')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/add-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tab,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          batch_id: batchId || null,
          qualification: qualification.trim() || null,
          city: city.trim() || null,
          profession: profession.trim() || null,
          subject_expertise: subjectExpertise.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to add user')
        return
      }

      setResult(data)
      toast.success(`${tab === 'teacher' ? 'Teacher' : 'Student'} added successfully`)
      if (tab === 'teacher') {
        fetchTeachers()
      }
    } catch {
      toast.error('Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  function copyCredentials() {
    if (!result) return
    navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.password}`)
    toast.success('Credentials copied to clipboard')
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === teachers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(teachers.map((u) => u.id)))
    }
  }

  async function handleDeleteTeacher(teacher: DisplayTeacher) {
    setBulkProcessing(true)

    const { error: profileError } = await supabase
      .from('teacher_profiles')
      .delete()
      .eq('id', teacher.id)

    if (profileError) {
      toast.error(`Failed to delete ${teacher.full_name}: ${profileError.message}`)
      setBulkProcessing(false)
      setDeleteDialog(null)
      return
    }

    const { error: roleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', teacher.auth_user_id)

    if (roleError) {
      toast.error(`Profile deleted but failed to remove role: ${roleError.message}`)
    } else {
      toast.success(`${teacher.full_name} deleted`)
    }
    setDeleteDialog(null)
    setBulkProcessing(false)
    fetchTeachers()
  }

  async function handleBulkDelete() {
    setBulkProcessing(true)
    const selected = teachers.filter((u) => selectedIds.has(u.id))
    const ids = selected.map((u) => u.id)
    const authIds = selected.map((u) => u.auth_user_id)

    const { error: profileError } = await supabase
      .from('teacher_profiles')
      .delete()
      .in('id', ids)

    if (profileError) {
      toast.error('Failed to delete selected teachers')
      setBulkProcessing(false)
      setBulkDeleteDialog(false)
      return
    }

    await supabase
      .from('user_roles')
      .delete()
      .in('user_id', authIds)

    toast.success(`${ids.length} teacher${ids.length > 1 ? 's' : ''} deleted`)
    setBulkDeleteDialog(false)
    setBulkProcessing(false)
    setSelectedIds(new Set())
    fetchTeachers()
  }

  async function handleBulkStatusChange(newStatus: 'active' | 'suspended') {
    setBulkProcessing(true)
    const ids = Array.from(selectedIds)

    const statusValue = newStatus === 'suspended' ? 'inactive' : newStatus

    const { error } = await supabase
      .from('teacher_profiles')
      .update({ status: statusValue })
      .in('id', ids)

    if (error) {
      toast.error('Failed to update status')
      setBulkProcessing(false)
      setBulkStatusDialog(null)
      return
    }

    const label = newStatus === 'active' ? 'activated' : 'suspended'
    toast.success(`${ids.length} teacher${ids.length > 1 ? 's' : ''} ${label}`)
    setBulkStatusDialog(null)
    setBulkProcessing(false)
    setSelectedIds(new Set())
    fetchTeachers()
  }

  async function handleResendEmail(teacher: DisplayTeacher) {
    try {
      const res = await fetch('/api/admin/resend-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: teacher.auth_user_id,
          email: teacher.email,
          full_name: teacher.full_name,
          type: 'teacher',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to resend email')
        return
      }
      if (data.email_sent === false) {
        toast.info(`Password reset for ${teacher.full_name}. New password: ${data.password}`, { duration: 15000 })
      } else {
        toast.success(`Welcome email resent to ${teacher.email}`)
      }
    } catch {
      toast.error('Failed to resend email')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const selectedCount = selectedIds.size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teachers &amp; User Creation</h1>
        <p className="mt-1 text-sm text-gray-500">Manage teacher accounts and create new students or teachers</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100/60 p-1.5 backdrop-blur-sm">
              <UserPlus className="h-5 w-5 text-indigo-600" />
            </div>
            Add User
          </CardTitle>
          <CardDescription>
            Create a new account with auto-generated credentials. A welcome email with login details will be sent automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => { setTab('student'); setResult(null) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                tab === 'student'
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Add Student
            </button>
            <button
              onClick={() => { setTab('teacher'); setResult(null) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                tab === 'teacher'
                  ? 'bg-violet-500/10 text-violet-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Add Teacher
            </button>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/50 p-6 text-center backdrop-blur-sm">
                <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
                <h3 className="mt-3 text-lg font-semibold text-gray-900">
                  {tab === 'teacher' ? 'Teacher' : 'Student'} Added
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Share these credentials with the user
                </p>
                <div className="mt-4 rounded-xl bg-white/70 p-4 text-left text-sm space-y-2 backdrop-blur-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{result.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Password</span>
                    <span className="font-mono font-medium text-gray-900">{result.password}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-3 justify-center">
                  <Button variant="outline" size="sm" onClick={copyCredentials}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy Credentials
                  </Button>
                  <Button size="sm" onClick={resetForm}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Add Another
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Full Name *"
                  placeholder="Rahul Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  label="Email *"
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {tab === 'student' ? (
                  <Select
                    label="Assign to Batch"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                  >
                    <option value="">No batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    label="Subject Expertise"
                    placeholder="Machine Learning, Python"
                    value={subjectExpertise}
                    onChange={(e) => setSubjectExpertise(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Qualification"
                  placeholder="B.Tech Computer Science"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                />
                {tab === 'student' ? (
                  <>
                    <Input
                      label="City"
                      placeholder="New Delhi"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </>
                ) : null}
              </div>

              {tab === 'student' && (
                <Input
                  label="Profession"
                  placeholder="Software Engineer"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              )}

              <div className="rounded-xl bg-amber-50/60 border border-amber-200/50 p-3 text-xs text-amber-700 backdrop-blur-sm">
                A password will be auto-generated and a welcome email with login credentials will be sent to the user. You can resend the email anytime from the user list.
                {tab === 'student' ? ' The student will be added with active status (pre-approved).' : ' The teacher will be added with active status.'}
              </div>

              <Button
                type="submit"
                disabled={loading || !fullName.trim() || !email.trim()}
                loading={loading}
                className="w-full"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {loading ? 'Adding...' : `Add ${tab === 'teacher' ? 'Teacher' : 'Student'}`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="rounded-xl bg-violet-100/60 p-1.5 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
            </div>
            Teachers
          </CardTitle>
          <CardDescription>
            Browse, search, and manage teacher accounts. For student management, visit the <a href="/admin/students" className="text-indigo-600 hover:underline">Students</a> page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
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
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </Select>
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50/60 border border-violet-200/50 px-4 py-3 backdrop-blur-sm">
              <span className="text-sm font-medium text-violet-700">
                {selectedCount} selected
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkStatusDialog('active')}
                >
                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                  Activate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkStatusDialog('suspended')}
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  Suspend
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteDialog(true)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {teachersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} shape="rect" className="h-14" />
              ))}
            </div>
          ) : teachers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No teachers found"
              description="No teachers match your current search or filter criteria."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === teachers.length && teachers.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(teacher.id)}
                          onChange={() => toggleSelect(teacher.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={teacher.profile_image_url}
                            fallback={teacher.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{teacher.full_name}</p>
                            <p className="truncate text-xs text-gray-500">{teacher.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(teacher.status)}>
                          {teacher.status.charAt(0).toUpperCase() + teacher.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">
                          {new Date(teacher.created_at).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResendEmail(teacher)}
                            title="Resend welcome email"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog(teacher)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-gray-500">
                    Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        title="Delete Teacher"
        description={deleteDialog ? `Are you sure you want to delete ${deleteDialog.full_name}? This action cannot be undone.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && handleDeleteTeacher(deleteDialog)}
              loading={bulkProcessing}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This will permanently remove the teacher&apos;s profile and role data. Their authentication account will remain but they will lose access to the platform.
        </p>
      </Dialog>

      <Dialog
        open={bulkDeleteDialog}
        onClose={() => setBulkDeleteDialog(false)}
        title="Delete Selected Teachers"
        description={`Are you sure you want to delete ${selectedCount} teacher${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              loading={bulkProcessing}
            >
              <Trash2 className="h-4 w-4" />
              Delete {selectedCount} Teacher{selectedCount > 1 ? 's' : ''}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This will permanently remove the profiles and role data for all selected teachers. Their authentication accounts will remain but they will lose access to the platform.
        </p>
      </Dialog>

      <Dialog
        open={!!bulkStatusDialog}
        onClose={() => setBulkStatusDialog(null)}
        title={bulkStatusDialog === 'active' ? 'Activate Selected Teachers' : 'Suspend Selected Teachers'}
        description={`${bulkStatusDialog === 'active' ? 'Activate' : 'Suspend'} ${selectedCount} selected teacher${selectedCount > 1 ? 's' : ''}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkStatusDialog(null)}>Cancel</Button>
            <Button
              variant={bulkStatusDialog === 'active' ? 'default' : 'destructive'}
              onClick={() => bulkStatusDialog && handleBulkStatusChange(bulkStatusDialog)}
              loading={bulkProcessing}
            >
              {bulkStatusDialog === 'active' ? (
                <><UserCheck className="h-4 w-4" /> Activate</>
              ) : (
                <><Ban className="h-4 w-4" /> Suspend</>
              )}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {bulkStatusDialog === 'active'
            ? 'The selected teachers will be activated and will be able to access the platform.'
            : 'The selected teachers will be suspended and will not be able to access the platform until reactivated.'}
        </p>
      </Dialog>
    </div>
  )
}
