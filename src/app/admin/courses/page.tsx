'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  BookOpen,
  GraduationCap,
  Archive,
  ArchiveRestore,
  CheckCircle,
  Calendar,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Course {
  id: string
  organization_id: string
  title: string
  description: string | null
  duration_weeks: number | null
  attendance_requirement: number
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

interface Batch {
  id: string
  course_id: string
  name: string
  instructor_id: string | null
  start_date: string | null
  end_date: string | null
  status: 'active' | 'completed' | 'archived'
  created_at: string
  updated_at: string
  total_planned_sessions?: number
  attendance_threshold_pct?: number
}

interface TeacherProfile {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  status: string
}

// ---------------------------------------------------------------------------
// Empty forms
// ---------------------------------------------------------------------------

const EMPTY_COURSE_FORM = {
  title: '',
  description: '',
  duration_weeks: '',
  attendance_requirement: '75',
}

const EMPTY_BATCH_FORM = {
  name: '',
  course_id: '',
  instructor_id: '',
  start_date: '',
  end_date: '',
  total_planned_sessions: '',
  attendance_threshold_pct: '75',
}

type CourseFormData = typeof EMPTY_COURSE_FORM
type BatchFormData = typeof EMPTY_BATCH_FORM

interface BatchTeacher {
  batch_id: string
  teacher_id: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success' as const
    case 'completed':
      return 'default' as const
    case 'archived':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CoursesPage() {
  const supabase = createClient()

  // Data state
  const [courses, setCourses] = useState<Course[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [teachers, setTeachers] = useState<TeacherProfile[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingBatches, setLoadingBatches] = useState(true)

  // Search
  const [courseSearch, setCourseSearch] = useState('')
  const [batchSearch, setBatchSearch] = useState('')

  // Course dialog
  const [courseDialogOpen, setCourseDialogOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [courseForm, setCourseForm] = useState<CourseFormData>(EMPTY_COURSE_FORM)
  const [courseFormLoading, setCourseFormLoading] = useState(false)

  // Batch dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [batchForm, setBatchForm] = useState<BatchFormData>(EMPTY_BATCH_FORM)
  const [batchFormLoading, setBatchFormLoading] = useState(false)

  // Multi-teacher per batch
  const [batchTeachersMap, setBatchTeachersMap] = useState<Record<string, string[]>>({})
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([])

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'course' | 'batch'; id: string; name: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Status-change loading
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true)
    try {
      let query = supabase
        .from('courses')
        .select('*')
        .order('title')

      if (courseSearch.trim()) {
        query = query.ilike('title', `%${courseSearch.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setCourses(data ?? [])
    } catch {
      toast.error('Failed to load courses')
    } finally {
      setLoadingCourses(false)
    }
  }, [courseSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      let query = supabase
        .from('batches')
        .select('*')
        .order('name')

      if (batchSearch.trim()) {
        query = query.ilike('name', `%${batchSearch.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setBatches(data ?? [])
    } catch {
      toast.error('Failed to load batches')
    } finally {
      setLoadingBatches(false)
    }
  }, [batchSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTeachers = useCallback(async () => {
    const { data, error } = await supabase
      .from('teacher_profiles')
      .select('id, auth_user_id, full_name, email, status')
      .eq('status', 'active')
      .order('full_name')
    if (!error && data) setTeachers(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBatchTeachers = useCallback(async () => {
    const { data } = await supabase
      .from('batch_teachers')
      .select('batch_id, teacher_id')
    if (data) {
      const map: Record<string, string[]> = {}
      for (const row of data as BatchTeacher[]) {
        if (!map[row.batch_id]) map[row.batch_id] = []
        map[row.batch_id].push(row.teacher_id)
      }
      setBatchTeachersMap(map)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTeachers() }, [fetchTeachers])
  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { fetchBatches() }, [fetchBatches])
  useEffect(() => { fetchBatchTeachers() }, [fetchBatchTeachers])

  // ---------------------------------------------------------------------------
  // Course helpers — maps for lookups
  // ---------------------------------------------------------------------------

  const courseMap = new Map(courses.map((c) => [c.id, c]))

  function courseName(courseId: string) {
    return courseMap.get(courseId)?.title ?? 'Unknown Course'
  }

  function instructorName(instructorId: string | null) {
    if (!instructorId) return '—'
    const t = teachers.find((tp) => tp.auth_user_id === instructorId)
    return t?.full_name ?? 'Unknown'
  }

  function batchTeacherNames(batchId: string, fallbackInstructorId: string | null): string {
    const teacherIds = batchTeachersMap[batchId]
    if (teacherIds && teacherIds.length > 0) {
      return teacherIds
        .map(tid => teachers.find(t => t.auth_user_id === tid)?.full_name ?? 'Unknown')
        .join(', ')
    }
    return instructorName(fallbackInstructorId)
  }

  // ---------------------------------------------------------------------------
  // Course dialog
  // ---------------------------------------------------------------------------

  function openCreateCourse() {
    setEditingCourse(null)
    setCourseForm(EMPTY_COURSE_FORM)
    setCourseDialogOpen(true)
  }

  function openEditCourse(course: Course) {
    setEditingCourse(course)
    setCourseForm({
      title: course.title,
      description: course.description ?? '',
      duration_weeks: course.duration_weeks?.toString() ?? '',
      attendance_requirement: course.attendance_requirement.toString(),
    })
    setCourseDialogOpen(true)
  }

  function closeCourseDialog() {
    setCourseDialogOpen(false)
    setEditingCourse(null)
    setCourseForm(EMPTY_COURSE_FORM)
  }

  async function handleCourseSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCourseFormLoading(true)

    const payload = {
      title: courseForm.title,
      description: courseForm.description || null,
      duration_weeks: courseForm.duration_weeks ? parseInt(courseForm.duration_weeks, 10) : null,
      attendance_requirement: parseInt(courseForm.attendance_requirement, 10) || 75,
    }

    try {
      if (editingCourse) {
        const { error } = await supabase
          .from('courses')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingCourse.id)
        if (error) throw error
        toast.success('Course updated successfully')
      } else {
        const { error } = await supabase
          .from('courses')
          .insert({ ...payload, organization_id: ORG_ID, status: 'active' })
        if (error) throw error
        toast.success('Course created successfully')
      }
      closeCourseDialog()
      fetchCourses()
    } catch {
      toast.error(editingCourse ? 'Failed to update course' : 'Failed to create course')
    } finally {
      setCourseFormLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Batch dialog
  // ---------------------------------------------------------------------------

  function openCreateBatch() {
    setEditingBatch(null)
    setBatchForm({
      ...EMPTY_BATCH_FORM,
      course_id: courses.length > 0 ? courses[0].id : '',
    })
    setSelectedTeacherIds([])
    setBatchDialogOpen(true)
  }

  function openEditBatch(batch: Batch & { total_planned_sessions?: number; attendance_threshold_pct?: number }) {
    setEditingBatch(batch)
    setBatchForm({
      name: batch.name,
      course_id: batch.course_id,
      instructor_id: batch.instructor_id ?? '',
      start_date: batch.start_date ?? '',
      end_date: batch.end_date ?? '',
      total_planned_sessions: batch.total_planned_sessions?.toString() ?? '',
      attendance_threshold_pct: batch.attendance_threshold_pct?.toString() ?? '75',
    })
    setSelectedTeacherIds(batchTeachersMap[batch.id] ?? (batch.instructor_id ? [batch.instructor_id] : []))
    setBatchDialogOpen(true)
  }

  function closeBatchDialog() {
    setBatchDialogOpen(false)
    setEditingBatch(null)
    setBatchForm(EMPTY_BATCH_FORM)
  }

  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBatchFormLoading(true)

    const primaryInstructor = selectedTeacherIds[0] || batchForm.instructor_id || null

    const payload = {
      name: batchForm.name,
      course_id: batchForm.course_id,
      instructor_id: primaryInstructor,
      start_date: batchForm.start_date || null,
      end_date: batchForm.end_date || null,
      total_planned_sessions: batchForm.total_planned_sessions ? parseInt(batchForm.total_planned_sessions, 10) : 0,
      attendance_threshold_pct: parseFloat(batchForm.attendance_threshold_pct) || 75,
    }

    try {
      let batchId: string

      if (editingBatch) {
        const { error } = await supabase
          .from('batches')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingBatch.id)
        if (error) throw error
        batchId = editingBatch.id
        toast.success('Batch updated successfully')
      } else {
        const { data, error } = await supabase
          .from('batches')
          .insert({ ...payload, status: 'active' })
          .select('id')
          .single()
        if (error) throw error
        batchId = data.id
        toast.success('Batch created successfully')
      }

      if (editingBatch) {
        await supabase.from('batch_teachers').delete().eq('batch_id', batchId)
      }
      if (selectedTeacherIds.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('batch_teachers').insert(
          selectedTeacherIds.map(tid => ({
            batch_id: batchId,
            teacher_id: tid,
            role: 'instructor',
            assigned_by: user?.id ?? null,
          }))
        )
      }

      closeBatchDialog()
      fetchBatches()
      fetchBatchTeachers()
    } catch {
      toast.error(editingBatch ? 'Failed to update batch' : 'Failed to create batch')
    } finally {
      setBatchFormLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Status toggling
  // ---------------------------------------------------------------------------

  async function toggleCourseStatus(course: Course) {
    setTogglingIds((prev) => new Set(prev).add(course.id))
    const newStatus = course.status === 'active' ? 'archived' : 'active'

    try {
      const { error } = await supabase
        .from('courses')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', course.id)
      if (error) throw error
      toast.success(`Course ${newStatus === 'archived' ? 'archived' : 'restored'} successfully`)
      fetchCourses()
    } catch {
      toast.error('Failed to update course status')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(course.id)
        return next
      })
    }
  }

  async function setBatchStatus(batch: Batch, newStatus: 'active' | 'completed' | 'archived') {
    setTogglingIds((prev) => new Set(prev).add(batch.id))

    try {
      const { error } = await supabase
        .from('batches')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', batch.id)
      if (error) throw error
      toast.success(`Batch marked as ${newStatus}`)
      fetchBatches()
    } catch {
      toast.error('Failed to update batch status')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(batch.id)
        return next
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)

    try {
      const table = deleteTarget.type === 'course' ? 'courses' : 'batches'
      const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success(`${deleteTarget.type === 'course' ? 'Course' : 'Batch'} deleted successfully`)
      if (deleteTarget.type === 'course') fetchCourses()
      else fetchBatches()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('violates foreign key')) {
        toast.error(`Cannot delete: other records still reference this ${deleteTarget.type}. Try archiving instead.`)
      } else {
        toast.error(`Failed to delete ${deleteTarget.type}`)
      }
    } finally {
      setDeleteLoading(false)
      setDeleteTarget(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const activeCourses = courses.filter((c) => c.status === 'active')

  return (
    <div className="space-y-10">
      {/* ================================================================== */}
      {/* COURSES SECTION                                                    */}
      {/* ================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Courses</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage courses offered by the organization
            </p>
          </div>
          <Button onClick={openCreateCourse}>
            <Plus className="h-4 w-4" />
            Add Course
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search courses by title..."
            value={courseSearch}
            onChange={(e) => setCourseSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loadingCourses ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="rect" height={56} />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses found"
            description={
              courseSearch
                ? 'No courses match your search. Try adjusting your search terms.'
                : 'Create your first course to get started.'
            }
            action={
              !courseSearch ? (
                <Button onClick={openCreateCourse}>
                  <Plus className="h-4 w-4" />
                  Add Course
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Attendance Req.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900">{course.title}</p>
                      {course.description && (
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                          {course.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {course.duration_weeks ? `${course.duration_weeks} weeks` : '—'}
                  </TableCell>
                  <TableCell>{course.attendance_requirement}%</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(course.status)}>
                      {course.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditCourse(course)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={togglingIds.has(course.id)}
                        onClick={() => toggleCourseStatus(course)}
                      >
                        {course.status === 'active' ? (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </>
                        ) : (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Restore
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeleteTarget({ type: 'course', id: course.id, name: course.title })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ================================================================== */}
      {/* BATCHES SECTION                                                    */}
      {/* ================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Batches</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage batches within courses
            </p>
          </div>
          <Button onClick={openCreateBatch} disabled={activeCourses.length === 0}>
            <Plus className="h-4 w-4" />
            Add Batch
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search batches by name..."
            value={batchSearch}
            onChange={(e) => setBatchSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loadingBatches ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="rect" height={56} />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No batches found"
            description={
              batchSearch
                ? 'No batches match your search. Try adjusting your search terms.'
                : activeCourses.length === 0
                  ? 'Create a course first before adding batches.'
                  : 'Create your first batch to organize students.'
            }
            action={
              !batchSearch && activeCourses.length > 0 ? (
                <Button onClick={openCreateBatch}>
                  <Plus className="h-4 w-4" />
                  Add Batch
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <p className="font-medium text-gray-900">{batch.name}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm">{courseName(batch.course_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm">{batchTeacherNames(batch.id, batch.instructor_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {formatDate(batch.start_date)}
                        {batch.end_date ? ` - ${formatDate(batch.end_date)}` : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(batch.status)}>
                      {batch.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditBatch(batch)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {batch.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={togglingIds.has(batch.id)}
                          onClick={() => setBatchStatus(batch, 'completed')}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Complete
                        </Button>
                      )}
                      {batch.status !== 'archived' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={togglingIds.has(batch.id)}
                          onClick={() => setBatchStatus(batch, 'archived')}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={togglingIds.has(batch.id)}
                          onClick={() => setBatchStatus(batch, 'active')}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeleteTarget({ type: 'batch', id: batch.id, name: batch.name })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ================================================================== */}
      {/* COURSE DIALOG                                                      */}
      {/* ================================================================== */}
      <Dialog
        open={courseDialogOpen}
        onClose={closeCourseDialog}
        title={editingCourse ? 'Edit Course' : 'Add Course'}
        description={
          editingCourse
            ? 'Update the course details below.'
            : 'Fill in the details to create a new course.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closeCourseDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="course-form"
              loading={courseFormLoading}
            >
              {editingCourse ? 'Save Changes' : 'Add Course'}
            </Button>
          </>
        }
      >
        <form id="course-form" onSubmit={handleCourseSubmit} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Gen AI Fundamentals"
            required
            value={courseForm.title}
            onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Textarea
            label="Description"
            placeholder="e.g. An introduction to generative AI, large language models, and prompt engineering"
            value={courseForm.description}
            onChange={(e) => setCourseForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input
            label="Duration (weeks)"
            type="number"
            placeholder="e.g. 12"
            min={1}
            value={courseForm.duration_weeks}
            onChange={(e) => setCourseForm((f) => ({ ...f, duration_weeks: e.target.value }))}
          />
          <Input
            label="Attendance Requirement (%)"
            type="number"
            placeholder="75"
            min={0}
            max={100}
            required
            value={courseForm.attendance_requirement}
            onChange={(e) =>
              setCourseForm((f) => ({ ...f, attendance_requirement: e.target.value }))
            }
          />
        </form>
      </Dialog>

      {/* ================================================================== */}
      {/* BATCH DIALOG                                                       */}
      {/* ================================================================== */}
      <Dialog
        open={batchDialogOpen}
        onClose={closeBatchDialog}
        title={editingBatch ? 'Edit Batch' : 'Add Batch'}
        description={
          editingBatch
            ? 'Update the batch details below.'
            : 'Fill in the details to create a new batch.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closeBatchDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="batch-form"
              loading={batchFormLoading}
            >
              {editingBatch ? 'Save Changes' : 'Add Batch'}
            </Button>
          </>
        }
      >
        <form id="batch-form" onSubmit={handleBatchSubmit} className="space-y-4">
          <Input
            label="Batch Name"
            placeholder="e.g. Gen AI - Batch 2026-A"
            required
            value={batchForm.name}
            onChange={(e) => setBatchForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label="Course"
            required
            value={batchForm.course_id}
            onChange={(e) => setBatchForm((f) => ({ ...f, course_id: e.target.value }))}
          >
            {activeCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Assigned Teachers
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
              {teachers.length === 0 ? (
                <p className="text-sm text-gray-400 px-2 py-1">No teachers available</p>
              ) : (
                teachers.map((t) => (
                  <label
                    key={t.auth_user_id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeacherIds.includes(t.auth_user_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTeacherIds(prev => [...prev, t.auth_user_id])
                        } else {
                          setSelectedTeacherIds(prev => prev.filter(id => id !== t.auth_user_id))
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">{t.full_name}</span>
                    <span className="text-xs text-gray-400">({t.email})</span>
                  </label>
                ))
              )}
            </div>
            {selectedTeacherIds.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">{selectedTeacherIds.length} teacher(s) selected</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={batchForm.start_date}
              onChange={(e) => setBatchForm((f) => ({ ...f, start_date: e.target.value }))}
            />
            <Input
              label="End Date"
              type="date"
              value={batchForm.end_date}
              onChange={(e) => setBatchForm((f) => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total Planned Sessions"
              type="number"
              placeholder="e.g. 30"
              min={0}
              value={batchForm.total_planned_sessions}
              onChange={(e) => setBatchForm((f) => ({ ...f, total_planned_sessions: e.target.value }))}
            />
            <Input
              label="Attendance Threshold (%)"
              type="number"
              placeholder="75"
              min={0}
              max={100}
              value={batchForm.attendance_threshold_pct}
              onChange={(e) => setBatchForm((f) => ({ ...f, attendance_threshold_pct: e.target.value }))}
            />
          </div>
        </form>
      </Dialog>

      {/* ================================================================== */}
      {/* DELETE CONFIRMATION DIALOG                                         */}
      {/* ================================================================== */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type === 'course' ? 'Course' : 'Batch'}`}
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteLoading}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-gray-600">
          {deleteTarget?.type === 'course' ? (
            <>
              <p className="font-medium text-red-600">This will permanently delete:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>All batches under this course</li>
                <li>All sessions, assignments, and projects in those batches</li>
                <li>All discussion threads and materials</li>
              </ul>
              <p>Students will be unlinked but not deleted. Consider archiving instead.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-red-600">This will permanently delete:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>All sessions and attendance records</li>
                <li>All assignments, projects, and submissions</li>
                <li>All discussion threads and materials</li>
              </ul>
              <p>Students will be unlinked but not deleted.</p>
            </>
          )}
        </div>
      </Dialog>
    </div>
  )
}
