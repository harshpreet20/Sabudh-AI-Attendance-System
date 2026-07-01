'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  TrendingUp,
  Star,
  Pencil,
  Trash2,
  Users,
  MessageSquare,
} from 'lucide-react'
import type { ProgressReview, StudentProfile, Batch } from '@/types/database'

export default function TeacherProgressPage() {
  const supabase = createClient()
  const [reviews, setReviews] = useState<(ProgressReview & { student?: StudentProfile })[]>([])
  const [students, setStudents] = useState<StudentProfile[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterBatch, setFilterBatch] = useState('')

  const [form, setForm] = useState({
    student_id: '',
    batch_id: '',
    rating: '3',
    review: '',
    areas_of_improvement: '',
  })

  const resetForm = () => {
    setForm({ student_id: '', batch_id: '', rating: '3', review: '', areas_of_improvement: '' })
    setEditingId(null)
  }

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

    if (batchIds.length > 0) {
      const { data: stu } = await supabase
        .from('student_profiles')
        .select('*')
        .in('batch_id', batchIds)
        .eq('status', 'active')
        .order('full_name')
      setStudents((stu as StudentProfile[]) ?? [])
    }

    let query = supabase
      .from('progress_reviews')
      .select('*')
      .eq('instructor_id', user.id)
      .order('created_at', { ascending: false })

    if (filterBatch) query = query.eq('batch_id', filterBatch)

    const { data } = await query
    const reviewList = (data as ProgressReview[]) ?? []

    const studentIds = [...new Set(reviewList.map(r => r.student_id))]
    let studentMap: Record<string, StudentProfile> = {}
    if (studentIds.length > 0) {
      const { data: stuData } = await supabase.from('student_profiles').select('*').in('id', studentIds)
      if (stuData) studentMap = Object.fromEntries((stuData as StudentProfile[]).map(s => [s.id, s]))
    }

    setReviews(reviewList.map(r => ({ ...r, student: studentMap[r.student_id] })))
    setLoading(false)
  }, [filterBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave() {
    if (!form.student_id || !form.review.trim()) {
      toast.error('Please select a student and write a review')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const student = students.find(s => s.id === form.student_id)
    const payload = {
      student_id: form.student_id,
      instructor_id: user.id,
      batch_id: form.batch_id || student?.batch_id || batches[0]?.id,
      rating: parseInt(form.rating),
      review: form.review.trim(),
      areas_of_improvement: form.areas_of_improvement.trim() || null,
    }

    if (editingId) {
      const { error } = await supabase.from('progress_reviews').update(payload).eq('id', editingId)
      if (error) toast.error('Failed to update')
      else toast.success('Review updated')
    } else {
      const { error } = await supabase.from('progress_reviews').insert(payload)
      if (error) toast.error('Failed to create review')
      else toast.success('Review created')
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('progress_reviews').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Deleted'); fetchData() }
  }

  function handleEdit(r: ProgressReview) {
    setForm({
      student_id: r.student_id,
      batch_id: r.batch_id,
      rating: String(r.rating),
      review: r.review,
      areas_of_improvement: r.areas_of_improvement ?? '',
    })
    setEditingId(r.id)
    setShowDialog(true)
  }

  const filteredStudents = form.batch_id
    ? students.filter(s => s.batch_id === form.batch_id)
    : students

  function renderStars(rating: number) {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
    ))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Progress Reviews</h1>
          <p className="mt-1 text-sm text-gray-500">Track and review student progress</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Review
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No reviews yet"
          description="Start reviewing your students' progress."
          action={<Button onClick={() => { resetForm(); setShowDialog(true) }}><Plus className="mr-2 h-4 w-4" />Write Review</Button>}
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar
                      src={r.student?.profile_image_url}
                      fallback={r.student?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '??'}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{r.student?.full_name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-0.5">{renderStars(r.rating)}</div>
                      </div>
                      <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{r.review}</p>
                      {r.areas_of_improvement && (
                        <div className="mt-2 rounded-lg bg-amber-50/50 p-2.5 text-sm text-amber-800">
                          <p className="text-xs font-medium text-amber-600 mb-0.5">Areas for Improvement</p>
                          {r.areas_of_improvement}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-start">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingId ? 'Edit Review' : 'New Progress Review'}
        description="Evaluate student performance and provide feedback."
      >
        <div className="space-y-4">
          <Select label="Batch" value={form.batch_id} onChange={(e) => setForm(f => ({ ...f, batch_id: e.target.value, student_id: '' }))}>
            <option value="">All Batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="Student *" value={form.student_id} onChange={(e) => setForm(f => ({ ...f, student_id: e.target.value }))}>
            <option value="">Select student</option>
            {filteredStudents.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Rating *</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, rating: String(n) }))}
                  className="p-1 transition-transform active:scale-90"
                >
                  <Star className={`h-7 w-7 ${n <= parseInt(form.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
          </div>
          <Textarea label="Review *" value={form.review} onChange={(e) => setForm(f => ({ ...f, review: e.target.value }))} placeholder="Strengths, accomplishments, observations..." rows={4} />
          <Textarea label="Areas for Improvement" value={form.areas_of_improvement} onChange={(e) => setForm(f => ({ ...f, areas_of_improvement: e.target.value }))} placeholder="What the student should focus on..." rows={3} />
          <Button onClick={handleSave} loading={saving} className="w-full">
            {editingId ? 'Update Review' : 'Submit Review'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
