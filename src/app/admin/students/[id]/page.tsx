'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { StudentProfile, StudentStatus, Batch } from '@/types/database'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  Building2,
  Heart,
  Target,
  Shield,
  UserX,
  UserCheck,
  Archive,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { suspendStudent, restoreStudent, archiveStudent } from '../actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StudentWithBatch extends StudentProfile {
  batches: { name: string } | null
}

function getStatusBadgeVariant(
  status: StudentStatus
): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' {
  switch (status) {
    case 'active':
      return 'success'
    case 'pending':
      return 'warning'
    case 'suspended':
      return 'destructive'
    case 'expelled':
      return 'destructive'
    case 'archived':
      return 'secondary'
    default:
      return 'default'
  }
}

function getAttendanceColor(percentage: number): string {
  if (percentage >= 80) return 'text-green-700'
  if (percentage >= 60) return 'text-amber-700'
  return 'text-red-700'
}

function getAttendanceBgColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-50'
  if (percentage >= 60) return 'bg-amber-50'
  return 'bg-red-50'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '--'
  }
}

// ---------------------------------------------------------------------------
// Server action wrappers
// ---------------------------------------------------------------------------

async function handleSuspend(studentId: string) {
  const result = await suspendStudent(studentId, 'Suspended by admin')
  if (!result.success) throw new Error(result.error)
}

async function handleRestore(studentId: string) {
  const result = await restoreStudent(studentId)
  if (!result.success) throw new Error(result.error)
}

async function handleArchive(studentId: string) {
  const result = await archiveStudent(studentId)
  if (!result.success) throw new Error(result.error)
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button skeleton */}
      <Skeleton shape="line" className="h-8 w-32" />

      {/* Profile header skeleton */}
      <div className="flex items-center gap-6">
        <Skeleton shape="circle" className="h-14 w-14" />
        <div className="space-y-2 flex-1">
          <Skeleton shape="line" className="h-6 w-48" />
          <Skeleton shape="line" className="h-4 w-36" />
        </div>
        <Skeleton shape="line" className="h-10 w-24" />
      </div>

      {/* Cards skeleton */}
      <Skeleton shape="rect" height={200} />
      <Skeleton shape="rect" height={250} />
      <Skeleton shape="rect" height={150} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const studentId = params.id

  // Data state
  const [student, setStudent] = useState<StudentWithBatch | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(searchParams.get('edit') === 'true')

  // Editable fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [qualification, setQualification] = useState('')
  const [profession, setProfession] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [gender, setGender] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [learningGoal, setLearningGoal] = useState('')
  const [batchId, setBatchId] = useState('')
  const [status, setStatus] = useState<StudentStatus>('active')

  // Populate form fields from student data
  const populateForm = useCallback((data: StudentWithBatch) => {
    setFullName(data.full_name)
    setPhone(data.phone || '')
    setCity(data.city || '')
    setQualification(data.qualification || '')
    setProfession(data.profession || '')
    setOrganizationName(data.organization_name || '')
    setGender(data.gender || '')
    setDateOfBirth(data.date_of_birth || '')
    setEmergencyContact(data.emergency_contact || '')
    setLearningGoal(data.learning_goal || '')
    setBatchId(data.batch_id || '')
    setStatus(data.status)
  }, [])

  // Fetch batches
  useEffect(() => {
    async function fetchBatches() {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('status', 'active')
        .order('name')

      if (error) {
        toast.error('Failed to load batches')
        return
      }
      setBatches(data ?? [])
    }
    fetchBatches()
  }, [supabase])

  // Fetch student profile
  const fetchStudent = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('*, batches(name)')
        .eq('id', studentId)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      const studentData: StudentWithBatch = {
        ...data,
        batches: data.batches as { name: string } | null,
      }

      setStudent(studentData)
      populateForm(studentData)
    } catch {
      toast.error('An unexpected error occurred')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [supabase, studentId, populateForm])

  useEffect(() => {
    fetchStudent()
  }, [fetchStudent])

  // Sync edit mode with search params
  useEffect(() => {
    setEditing(searchParams.get('edit') === 'true')
  }, [searchParams])

  // Toggle edit mode
  function toggleEdit() {
    if (editing) {
      // Cancel editing - reset form
      if (student) populateForm(student)
      router.replace(`/admin/students/${studentId}`)
    } else {
      router.replace(`/admin/students/${studentId}?edit=true`)
    }
  }

  // Save changes
  async function handleSave() {
    if (!student) return

    setSaving(true)
    try {
      const updates: Record<string, string | null> = {
        full_name: fullName,
        phone: phone || null,
        city: city || null,
        qualification: qualification || null,
        profession: profession || null,
        organization_name: organizationName || null,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        emergency_contact: emergencyContact || null,
        learning_goal: learningGoal || null,
        batch_id: batchId || null,
        status: status,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('student_profiles')
        .update(updates)
        .eq('id', studentId)

      if (error) {
        toast.error('Failed to update student profile')
        return
      }

      toast.success('Student profile updated successfully')
      router.replace(`/admin/students/${studentId}`)
      fetchStudent()
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  // Status action handler
  async function handleStatusAction(
    action: (id: string) => Promise<void>,
    successMessage: string
  ) {
    setActionLoading(true)
    try {
      await action(studentId)
      toast.success(successMessage)
      fetchStudent()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return <ProfileSkeleton />
  }

  if (notFound || !student) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin/students')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Students
        </Button>
        <EmptyState
          icon={AlertCircle}
          title="Student not found"
          description="The student profile you are looking for does not exist or has been removed."
          action={
            <Button onClick={() => router.push('/admin/students')}>
              Back to Students
            </Button>
          }
        />
      </div>
    )
  }

  const initials = getInitials(student.full_name)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin/students')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Students
        </Button>
        <div className="flex items-center gap-2">
          {/* Status action buttons */}
          {!editing && student.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading}
              loading={actionLoading}
              onClick={() =>
                handleStatusAction(handleSuspend, 'Student suspended successfully')
              }
            >
              <UserX className="h-4 w-4" />
              Suspend
            </Button>
          )}
          {!editing && student.status === 'suspended' && (
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading}
              loading={actionLoading}
              onClick={() =>
                handleStatusAction(handleRestore, 'Student restored successfully')
              }
            >
              <UserCheck className="h-4 w-4" />
              Restore
            </Button>
          )}
          {!editing && student.status !== 'archived' && (
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading}
              loading={actionLoading}
              onClick={() =>
                handleStatusAction(handleArchive, 'Student archived successfully')
              }
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
          {/* Edit / Cancel button */}
          <Button
            variant={editing ? 'outline' : 'default'}
            size="sm"
            onClick={toggleEdit}
          >
            {editing ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Edit className="h-4 w-4" />
                Edit
              </>
            )}
          </Button>
          {/* Save button (edit mode only) */}
          {editing && (
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Profile header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Avatar
              src={student.profile_image_url}
              alt={student.full_name}
              fallback={initials}
              size="lg"
              className="h-20 w-20 text-xl"
            />
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold text-gray-900">
                {student.full_name}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">{student.email}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <Badge variant={getStatusBadgeVariant(student.status)}>
                  {student.status.charAt(0).toUpperCase() +
                    student.status.slice(1)}
                </Badge>
                {student.batches?.name && (
                  <Badge variant="outline">
                    <Users className="mr-1 h-3 w-3" />
                    {student.batches.name}
                  </Badge>
                )}
              </div>
            </div>
            {student.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Phone className="h-4 w-4" />
                {student.phone}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance stats card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-gray-500" />
            Attendance Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
              <div
                className={`text-2xl font-bold ${getAttendanceColor(student.attendance_percentage)}`}
              >
                {student.attendance_percentage.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-gray-500">Attendance</div>
            </div>
            <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-2xl font-bold text-green-700">
                  {student.present_count}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">Present</div>
            </div>
            <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-2xl font-bold text-red-700">
                  {student.absent_count}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">Absent</div>
            </div>
            <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
              <div className="flex items-center justify-center gap-1">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-2xl font-bold text-amber-700">
                  {student.late_count}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">Late</div>
            </div>
            <div className="rounded-xl bg-white/50 p-4 text-center backdrop-blur-sm">
              <div className="text-2xl font-bold text-gray-700">
                {student.total_sessions}
              </div>
              <div className="mt-1 text-xs text-gray-500">Total Sessions</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal information card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-gray-500" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Student full name"
                />
                <Input
                  label="Phone Number"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 12345 67890"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="flex h-10 w-full appearance-none rounded-xl px-3 py-2 text-sm text-gray-900 transition-all duration-200 glass-input"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
                <Input
                  label="Date of Birth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Enter city"
                />
                <Input
                  label="Emergency Contact"
                  type="tel"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="+91 12345 67890"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Qualification"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. B.Tech, M.Sc"
                />
                <Input
                  label="Profession"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="e.g. Software Engineer, Student"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Organization"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Company or institution name"
                />
                <Select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="">No batch</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StudentStatus)}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                  <option value="expelled">Expelled</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
              <Textarea
                label="Learning Goal"
                value={learningGoal}
                onChange={(e) => setLearningGoal(e.target.value)}
                placeholder="What does the student want to learn?"
                rows={3}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoField
                icon={User}
                label="Full Name"
                value={student.full_name}
              />
              <InfoField
                icon={Mail}
                label="Email"
                value={student.email}
              />
              <InfoField
                icon={Phone}
                label="Phone"
                value={student.phone}
              />
              <InfoField
                icon={MapPin}
                label="City"
                value={student.city}
              />
              <InfoField
                icon={User}
                label="Gender"
                value={
                  student.gender
                    ? student.gender.charAt(0).toUpperCase() +
                      student.gender.slice(1).replace('_', ' ')
                    : null
                }
              />
              <InfoField
                icon={Calendar}
                label="Date of Birth"
                value={student.date_of_birth ? formatDate(student.date_of_birth) : null}
              />
              <InfoField
                icon={GraduationCap}
                label="Qualification"
                value={student.qualification}
              />
              <InfoField
                icon={Briefcase}
                label="Profession"
                value={student.profession}
              />
              <InfoField
                icon={Building2}
                label="Organization"
                value={student.organization_name}
              />
              <InfoField
                icon={Users}
                label="Batch"
                value={student.batches?.name ?? null}
              />
              <InfoField
                icon={Heart}
                label="Emergency Contact"
                value={student.emergency_contact}
              />
              <InfoField
                icon={Calendar}
                label="Member Since"
                value={formatDate(student.created_at)}
              />
              <div className="sm:col-span-2">
                <InfoField
                  icon={Target}
                  label="Learning Goal"
                  value={student.learning_goal}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Info field display component
// ---------------------------------------------------------------------------

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-500">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-900">{value || '--'}</span>
      </div>
    </div>
  )
}
