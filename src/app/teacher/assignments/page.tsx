'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  ClipboardList,
  Pencil,
  Trash2,
  Eye,
  Calendar,
  Users,
  CheckCircle2,
} from 'lucide-react'
import type { Assignment, Batch } from '@/types/database'
import Link from 'next/link'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  active: 'default',
  closed: 'warning',
  archived: 'destructive',
}

export default function TeacherAssignmentsPage() {
  const supabase = createClient()
  const [assignments, setAssignments] = useState<(Assignment & { submission_count?: number })[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterBatch, setFilterBatch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [form, setForm] = useState({
    batch_id: '',
    title: '',
    description: '',
    due_date: '',
    max_score: '100',
    status: 'active',
  })

  const resetForm = () => {
    setForm({ batch_id: '', title: '', description: '', due_date: '', max_score: '100', status: 'active' })
    setEditingId(null)
  }

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

    let query = supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterBatch) query = query.eq('batch_id', filterBatch)
    if (filterStatus) query = query.eq('status', filterStatus)

    const { data } = await query
    const assignmentList = (data as Assignment[]) ?? []

    const withCounts = await Promise.all(
      assignmentList.map(async (a) => {
        const { count } = await supabase
          .from('assignment_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('assignment_id', a.id)
        return { ...a, submission_count: count ?? 0 }
      })
    )

    setAssignments(withCounts)
    setLoading(false)
  }, [filterBatch, filterStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave() {
    if (!form.batch_id || !form.title.trim() || !form.due_date) {
      toast.error('Please fill in batch, title, and due date')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      organization_id: ORG_ID,
      batch_id: form.batch_id,
      instructor_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date,
      max_score: parseInt(form.max_score) || 100,
      status: form.status,
    }

    if (editingId) {
      const { error } = await supabase.from('assignments').update(payload).eq('id', editingId)
      if (error) toast.error('Failed to update assignment')
      else toast.success('Assignment updated')
    } else {
      const { error } = await supabase.from('assignments').insert(payload)
      if (error) toast.error('Failed to create assignment')
      else toast.success('Assignment created')
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('assignments').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Assignment deleted'); fetchData() }
  }

  function handleEdit(a: Assignment) {
    setForm({
      batch_id: a.batch_id,
      title: a.title,
      description: a.description ?? '',
      due_date: a.due_date,
      max_score: String(a.max_score),
      status: a.status,
    })
    setEditingId(a.id)
    setShowDialog(true)
  }

  function getBatchName(id: string) {
    return batches.find(b => b.id === id)?.name ?? 'Unknown'
  }

  const isOverdue = (d: string) => new Date(d) < new Date()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="mt-1 text-sm text-gray-500">Create and track student assignments</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Assignment
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description="Create your first assignment to get started."
          action={
            <Button onClick={() => { resetForm(); setShowDialog(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Assignment
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{a.title}</p>
                      <Badge variant={STATUS_VARIANTS[a.status]}>{a.status}</Badge>
                      {a.status === 'active' && isOverdue(a.due_date) && (
                        <Badge variant="destructive">Overdue</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {getBatchName(a.batch_id)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Due {new Date(a.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {a.submission_count} submissions
                      </span>
                    </div>
                    {a.description && (
                      <p className="mt-1 text-sm text-gray-400 line-clamp-1">{a.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-center">
                    <Link href={`/teacher/assignments/${a.id}`}>
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
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
        title={editingId ? 'Edit Assignment' : 'Create Assignment'}
        description={editingId ? 'Update the assignment details.' : 'Fill in the details for the new assignment.'}
      >
        <div className="space-y-4">
          <Select label="Batch *" value={form.batch_id} onChange={(e) => setForm(f => ({ ...f, batch_id: e.target.value }))}>
            <option value="">Select batch</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input label="Title *" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., Week 3 - Neural Networks Quiz" />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Assignment instructions, requirements, etc." rows={4} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Due Date *" type="date" value={form.due_date} onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} />
            <Input label="Max Score" type="number" value={form.max_score} onChange={(e) => setForm(f => ({ ...f, max_score: e.target.value }))} />
          </div>
          <Select label="Status" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Select>
          <Button onClick={handleSave} loading={saving} className="w-full">
            {editingId ? 'Update Assignment' : 'Create Assignment'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
