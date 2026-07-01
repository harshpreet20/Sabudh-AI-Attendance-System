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
  FolderInput,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { StudentProfile, TeacherProfile, Batch } from '@/types/database'

type UserType = 'student' | 'teacher'
type StatusFilter = 'all' | 'active' | 'pending' | 'suspended'

interface DisplayUser {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  phone: string | null
  status: string
  profile_image_url: string | null
  batch_id?: string | null
  created_at: string
  type: UserType
}

const PAGE_SIZE = 15

function getStatusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success' as const
    case 'pending':
      return 'warning' as const
    case 'suspended':
    case 'expelled':
      return 'destructive' as const
    default:
      return 'secondary' as const
  }
}

export default function AdminUsersPage() {
  const supabase = createClient()

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

  const [users, setUsers] = useState<DisplayUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [userTab, setUserTab] = useState<UserType>('student')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<DisplayUser | null>(null)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false)
  const [bulkStatusDialog, setBulkStatusDialog] = useState<'active' | 'suspended' | null>(null)
  const [batchAssignDialog, setBatchAssignDialog] = useState(false)
  const [assignBatchId, setAssignBatchId] = useState('')

  const fetchBatches = useCallback(async () => {
    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')
    setBatches((data as Batch[]) ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    setSelectedIds(new Set())

    const table = userTab === 'student' ? 'student_profiles' : 'teacher_profiles'

    let query = supabase
      .from(table)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (searchQuery.trim()) {
      query = query.or(`full_name.ilike.%${searchQuery.trim()}%,email.ilike.%${searchQuery.trim()}%`)
    }

    const { data, count } = await query

    const mapped: DisplayUser[] = ((data ?? []) as (StudentProfile | TeacherProfile)[]).map((u) => ({
      id: u.id,
      auth_user_id: u.auth_user_id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      profile_image_url: u.profile_image_url,
      batch_id: 'batch_id' in u ? u.batch_id : null,
      created_at: u.created_at,
      type: userTab,
    }))

    setUsers(mapped)
    setTotal(count ?? 0)
    setUsersLoading(false)
  }, [userTab, page, statusFilter, searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
  }, [userTab, searchQuery, statusFilter])

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
      fetchUsers()
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
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)))
    }
  }

  async function handleDeleteUser(user: DisplayUser) {
    setBulkProcessing(true)
    const table = user.type === 'student' ? 'student_profiles' : 'teacher_profiles'

    const { error: profileError } = await supabase
      .from(table)
      .delete()
      .eq('id', user.id)

    if (profileError) {
      toast.error(`Failed to delete ${user.full_name}`)
      setBulkProcessing(false)
      setDeleteDialog(null)
      return
    }

    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', user.auth_user_id)

    toast.success(`${user.full_name} deleted`)
    setDeleteDialog(null)
    setBulkProcessing(false)
    fetchUsers()
  }

  async function handleBulkDelete() {
    setBulkProcessing(true)
    const selected = users.filter((u) => selectedIds.has(u.id))
    const table = userTab === 'student' ? 'student_profiles' : 'teacher_profiles'
    const ids = selected.map((u) => u.id)
    const authIds = selected.map((u) => u.auth_user_id)

    const { error: profileError } = await supabase
      .from(table)
      .delete()
      .in('id', ids)

    if (profileError) {
      toast.error('Failed to delete selected users')
      setBulkProcessing(false)
      setBulkDeleteDialog(false)
      return
    }

    await supabase
      .from('user_roles')
      .delete()
      .in('user_id', authIds)

    toast.success(`${ids.length} user${ids.length > 1 ? 's' : ''} deleted`)
    setBulkDeleteDialog(false)
    setBulkProcessing(false)
    setSelectedIds(new Set())
    fetchUsers()
  }

  async function handleBulkStatusChange(newStatus: 'active' | 'suspended') {
    setBulkProcessing(true)
    const ids = Array.from(selectedIds)
    const table = userTab === 'student' ? 'student_profiles' : 'teacher_profiles'

    const statusValue = userTab === 'teacher' && newStatus === 'suspended' ? 'inactive' : newStatus

    const { error } = await supabase
      .from(table)
      .update({ status: statusValue })
      .in('id', ids)

    if (error) {
      toast.error(`Failed to update status`)
      setBulkProcessing(false)
      setBulkStatusDialog(null)
      return
    }

    const label = newStatus === 'active' ? 'activated' : 'suspended'
    toast.success(`${ids.length} user${ids.length > 1 ? 's' : ''} ${label}`)
    setBulkStatusDialog(null)
    setBulkProcessing(false)
    setSelectedIds(new Set())
    fetchUsers()
  }

  async function handleBulkBatchAssign() {
    if (!assignBatchId) {
      toast.error('Please select a batch')
      return
    }

    setBulkProcessing(true)
    const ids = Array.from(selectedIds)

    const { error } = await supabase
      .from('student_profiles')
      .update({ batch_id: assignBatchId })
      .in('id', ids)

    if (error) {
      toast.error('Failed to assign batch')
      setBulkProcessing(false)
      setBatchAssignDialog(false)
      return
    }

    const batch = batches.find((b) => b.id === assignBatchId)
    toast.success(`${ids.length} student${ids.length > 1 ? 's' : ''} assigned to ${batch?.name ?? 'batch'}`)
    setBatchAssignDialog(false)
    setAssignBatchId('')
    setBulkProcessing(false)
    setSelectedIds(new Set())
    fetchUsers()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const selectedCount = selectedIds.size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
        <p className="mt-1 text-sm text-gray-500">Add new students and teachers, and manage existing accounts</p>
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
                A password will be auto-generated and a welcome email with login credentials will be sent to the user.
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
              <Users className="h-5 w-5 text-violet-600" />
            </div>
            All Users
          </CardTitle>
          <CardDescription>
            Browse, search, and manage all user accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setUserTab('student')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                userTab === 'student'
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Students
            </button>
            <button
              onClick={() => setUserTab('teacher')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                userTab === 'teacher'
                  ? 'bg-violet-500/10 text-violet-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Teachers
            </button>
          </div>

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
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/60 border border-indigo-200/50 px-4 py-3 backdrop-blur-sm">
              <span className="text-sm font-medium text-indigo-700">
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
                {userTab === 'student' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setBatchAssignDialog(true); setAssignBatchId('') }}
                  >
                    <FolderInput className="mr-1 h-3.5 w-3.5" />
                    Assign to Batch
                  </Button>
                )}
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

          {usersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} shape="rect" className="h-14" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description="No users match your current search or filter criteria."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === users.length && users.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    {userTab === 'student' && <TableHead>Batch</TableHead>}
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const batchName = user.batch_id
                      ? batches.find((b) => b.id === user.batch_id)?.name ?? 'Unknown'
                      : null

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(user.id)}
                            onChange={() => toggleSelect(user.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={user.profile_image_url}
                              fallback={user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{user.full_name}</p>
                              <p className="truncate text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(user.status)}>
                            {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                          </Badge>
                        </TableCell>
                        {userTab === 'student' && (
                          <TableCell>
                            {batchName ? (
                              <span className="text-sm text-gray-700">{batchName}</span>
                            ) : (
                              <span className="text-sm text-gray-400">Unassigned</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog(user)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
        title="Delete User"
        description={deleteDialog ? `Are you sure you want to delete ${deleteDialog.full_name}? This action cannot be undone.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && handleDeleteUser(deleteDialog)}
              loading={bulkProcessing}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This will permanently remove the user&apos;s profile and role data. Their authentication account will remain but they will lose access to the platform.
        </p>
      </Dialog>

      <Dialog
        open={bulkDeleteDialog}
        onClose={() => setBulkDeleteDialog(false)}
        title="Delete Selected Users"
        description={`Are you sure you want to delete ${selectedCount} user${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              loading={bulkProcessing}
            >
              <Trash2 className="h-4 w-4" />
              Delete {selectedCount} User{selectedCount > 1 ? 's' : ''}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This will permanently remove the profiles and role data for all selected users. Their authentication accounts will remain but they will lose access to the platform.
        </p>
      </Dialog>

      <Dialog
        open={!!bulkStatusDialog}
        onClose={() => setBulkStatusDialog(null)}
        title={bulkStatusDialog === 'active' ? 'Activate Selected Users' : 'Suspend Selected Users'}
        description={`${bulkStatusDialog === 'active' ? 'Activate' : 'Suspend'} ${selectedCount} selected user${selectedCount > 1 ? 's' : ''}?`}
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
            ? 'The selected users will be activated and will be able to access the platform.'
            : 'The selected users will be suspended and will not be able to access the platform until reactivated.'}
        </p>
      </Dialog>

      <Dialog
        open={batchAssignDialog}
        onClose={() => { setBatchAssignDialog(false); setAssignBatchId('') }}
        title="Assign to Batch"
        description={`Assign ${selectedCount} selected student${selectedCount > 1 ? 's' : ''} to a batch`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setBatchAssignDialog(false); setAssignBatchId('') }}>Cancel</Button>
            <Button
              onClick={handleBulkBatchAssign}
              loading={bulkProcessing}
              disabled={!assignBatchId}
            >
              <FolderInput className="h-4 w-4" />
              Assign
            </Button>
          </>
        }
      >
        <Select
          label="Select Batch"
          value={assignBatchId}
          onChange={(e) => setAssignBatchId(e.target.value)}
        >
          <option value="">Choose a batch...</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Dialog>
    </div>
  )
}
