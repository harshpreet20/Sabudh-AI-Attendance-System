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
import { Textarea } from '@/components/ui/textarea'
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
  MapPin,
  Camera,
  Check,
  X,
  Image,
  BarChart3,
  Award,
  Upload,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import type { StudentProfile, Batch, ProfilePhotoRequest } from '@/types/database'

interface PhotoRequestWithStudent extends ProfilePhotoRequest {
  student_profiles: {
    full_name: string
    email: string
    batch_id: string | null
  }
}

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
  const [tab, setTab] = useState<'active' | 'pending' | 'photos'>('active')
  const [processing, setProcessing] = useState<string | null>(null)
  const [photoRequests, setPhotoRequests] = useState<PhotoRequestWithStudent[]>([])
  const [photoProcessing, setPhotoProcessing] = useState<string | null>(null)
  const [photoRejectDialog, setPhotoRejectDialog] = useState<PhotoRequestWithStudent | null>(null)
  const [reviewerNote, setReviewerNote] = useState('')

  const [approveDialog, setApproveDialog] = useState<StudentProfile | null>(null)
  const [assignBatch, setAssignBatch] = useState('')

  const [banDialog, setBanDialog] = useState<StudentProfile | null>(null)
  const [removeDialog, setRemoveDialog] = useState<StudentProfile | null>(null)

  const [addDialog, setAddDialog] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [certDialog, setCertDialog] = useState<StudentProfile | null>(null)
  const [certUploading, setCertUploading] = useState(false)
  const certInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
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

    if (batchIds.length > 0) {
      const { data: photoData } = await supabase
        .from('profile_photo_requests')
        .select('*, student_profiles(full_name, email, batch_id)')
        .eq('status', 'pending')
        .in('student_profiles.batch_id', batchIds)
        .order('created_at', { ascending: false })

      const validPhotoRequests = (photoData ?? []).filter(
        (r: Record<string, unknown>) => r.student_profiles !== null
      )
      setPhotoRequests(validPhotoRequests as PhotoRequestWithStudent[])
    }

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

  async function handleCertificateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !certDialog) return

    const maxSize = 20 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('File size exceeds 20MB limit')
      if (certInputRef.current) certInputRef.current.value = ''
      return
    }

    setCertUploading(true)

    try {
      const timestamp = Date.now()
      const storagePath = `certificates/${certDialog.id}/${timestamp}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(storagePath, file)

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(storagePath)

      // Look up the course_id from the student's batch
      let courseId: string | null = null
      if (certDialog.batch_id) {
        const { data: batchData } = await supabase
          .from('batches')
          .select('course_id')
          .eq('id', certDialog.batch_id)
          .limit(1)

        if (batchData && batchData.length > 0) {
          courseId = batchData[0].course_id
        }
      }

      if (!courseId) {
        // Fallback: get first course
        const { data: courseData } = await supabase
          .from('courses')
          .select('id')
          .limit(1)

        courseId = courseData?.[0]?.id ?? null
      }

      if (!courseId) {
        toast.error('No course found to associate certificate with')
        await supabase.storage.from('uploads').remove([storagePath])
        return
      }

      // Check if student already has a certificate
      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('student_id', certDialog.id)
        .eq('status', 'active')
        .limit(1)

      if (existing && existing.length > 0) {
        // Update existing certificate with uploaded file
        const { error: updateError } = await supabase
          .from('certificates')
          .update({
            certificate_file_url: publicUrl,
            certificate_storage_path: storagePath,
          })
          .eq('id', existing[0].id)

        if (updateError) {
          toast.error(`Failed to update certificate: ${updateError.message}`)
          await supabase.storage.from('uploads').remove([storagePath])
          return
        }
      } else {
        // Create new certificate record
        const { error: insertError } = await supabase
          .from('certificates')
          .insert({
            student_id: certDialog.id,
            course_id: courseId,
            attendance_percentage: certDialog.attendance_percentage ?? 0,
            certificate_file_url: publicUrl,
            certificate_storage_path: storagePath,
          })

        if (insertError) {
          toast.error(`Failed to save certificate: ${insertError.message}`)
          await supabase.storage.from('uploads').remove([storagePath])
          return
        }
      }

      toast.success(`Certificate uploaded for ${certDialog.full_name}`)
      setCertDialog(null)
    } catch {
      toast.error('Failed to upload certificate')
    } finally {
      setCertUploading(false)
      if (certInputRef.current) certInputRef.current.value = ''
    }
  }

  async function approvePhotoRequest(request: PhotoRequestWithStudent) {
    setPhotoProcessing(request.id)

    const { data: { user } } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('profile_photo_requests')
      .update({
        status: 'approved',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_note: null,
      })
      .eq('id', request.id)

    if (updateError) {
      toast.error('Failed to approve photo request')
      setPhotoProcessing(null)
      return
    }

    const { error: profileError } = await supabase
      .from('student_profiles')
      .update({ profile_image_url: request.new_photo_url })
      .eq('id', request.student_profile_id)

    if (profileError) {
      toast.error('Photo approved but failed to update profile')
    } else {
      toast.success(`Photo approved for ${request.student_profiles.full_name}`)
    }

    setPhotoRequests(prev => prev.filter(r => r.id !== request.id))
    setPhotoProcessing(null)
  }

  async function rejectPhotoRequest(request: PhotoRequestWithStudent) {
    setPhotoProcessing(request.id)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('profile_photo_requests')
      .update({
        status: 'rejected',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_note: reviewerNote || null,
      })
      .eq('id', request.id)

    if (error) {
      toast.error('Failed to reject photo request')
    } else {
      toast.success(`Photo rejected for ${request.student_profiles.full_name}`)
      await supabase.storage.from('avatars').remove([request.new_photo_storage_path])
    }

    setPhotoRequests(prev => prev.filter(r => r.id !== request.id))
    setPhotoProcessing(null)
    setPhotoRejectDialog(null)
    setReviewerNote('')
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
        <button
          onClick={() => setTab('photos')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'photos'
              ? 'bg-cyan-500/10 text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:bg-white/50'
          }`}
        >
          <Camera className="h-4 w-4" />
          Photo Requests
          {photoRequests.length > 0 && (
            <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-xs font-bold text-white">
              {photoRequests.length}
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

                          <div className="flex flex-wrap gap-2 pt-3 border-t border-white/20">
                            <Link href={`/teacher/students/${student.id}`} onClick={e => e.stopPropagation()} className="flex-1">
                              <Button variant="outline" size="sm" className="w-full">
                                <BarChart3 className="mr-1 h-3.5 w-3.5" />
                                Performance
                              </Button>
                            </Link>
                            <Link href={`/teacher/students/journey?id=${student.id}`} onClick={e => e.stopPropagation()} className="flex-1">
                              <Button variant="outline" size="sm" className="w-full">
                                <MapPin className="mr-1 h-3.5 w-3.5" />
                                Journey
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={(e) => { e.stopPropagation(); setCertDialog(student) }}
                            >
                              <Award className="mr-1 h-3.5 w-3.5" />
                              Certificate
                            </Button>
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
                          src={student.profile_image_url}
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

      {tab === 'photos' && (
        <>
          {photoRequests.length === 0 ? (
            <EmptyState
              icon={Image}
              title="No pending photo requests"
              description="No students in your batches have pending photo change requests."
            />
          ) : (
            <div className="space-y-3">
              {photoRequests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="mb-1 text-xs text-gray-400">Current</p>
                            <Avatar
                              src={request.old_photo_url}
                              fallback={request.student_profiles.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              size="lg"
                            />
                          </div>
                          <span className="text-gray-300">&#8594;</span>
                          <div className="text-center">
                            <p className="mb-1 text-xs text-gray-400">New</p>
                            <Avatar
                              src={request.new_photo_url}
                              fallback="?"
                              size="lg"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {request.student_profiles.full_name}
                          </p>
                          <p className="text-sm text-gray-500">{request.student_profiles.email}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            Requested: {new Date(request.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { setPhotoRejectDialog(request); setReviewerNote('') }}
                          disabled={!!photoProcessing}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approvePhotoRequest(request)}
                          loading={photoProcessing === request.id}
                          disabled={!!photoProcessing}
                        >
                          <Check className="h-4 w-4" />
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

      {/* Photo Reject Dialog */}
      <Dialog
        open={!!photoRejectDialog}
        onClose={() => { setPhotoRejectDialog(null); setReviewerNote('') }}
        title="Reject Photo Change"
        description={photoRejectDialog ? `Reject photo change for ${photoRejectDialog.student_profiles.full_name}?` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPhotoRejectDialog(null); setReviewerNote('') }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => photoRejectDialog && rejectPhotoRequest(photoRejectDialog)}
              loading={!!photoProcessing}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason for rejection (optional)"
          value={reviewerNote}
          onChange={(e) => setReviewerNote(e.target.value)}
          placeholder="e.g. Photo is blurry, not a proper headshot"
          rows={3}
        />
      </Dialog>

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

      {/* Certificate Upload Dialog */}
      <Dialog
        open={!!certDialog}
        onClose={() => { setCertDialog(null); if (certInputRef.current) certInputRef.current.value = '' }}
        title="Upload Certificate"
        description={certDialog ? `Upload a certificate file for ${certDialog.full_name}` : ''}
      >
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
            <Award className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Upload a PDF or image file of the certificate
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Accepted formats: PDF, PNG, JPG (max 20MB)
            </p>
            <input
              ref={certInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleCertificateUpload}
              className="hidden"
              disabled={certUploading}
            />
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => certInputRef.current?.click()}
              loading={certUploading}
              disabled={certUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {certUploading ? 'Uploading...' : 'Choose File'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            If a certificate already exists for this student, the uploaded file will be attached to it. Otherwise, a new certificate record will be created.
          </p>
        </div>
      </Dialog>
    </div>
  )
}
