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
  Timer,
  Award,
  BarChart3,
  AlertTriangle,
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

  function dueCountdown(d: string): { text: string; urgent: boolean; color: string } {
    const now = new Date()
    const due = new Date(d)
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true, color: 'text-red-600' }
    if (diffDays === 0) return { text: 'Due today', urgent: true, color: 'text-amber-600' }
    if (diffDays === 1) return { text: 'Due tomorrow', urgent: true, color: 'text-amber-500' }
    if (diffDays <= 3) return { text: `${diffDays}d left`, urgent: true, color: 'text-amber-500' }
    if (diffDays <= 7) return { text: `${diffDays}d left`, urgent: false, color: 'text-blue-500' }
    return { text: `${diffDays}d left`, urgent: false, color: 'text-gray-500' }
  }

  const totalSubmissions = assignments.reduce((s, a) => s + (a.submission_count ?? 0), 0)
  const activeCount = assignments.filter(a => a.status === 'active').length
  const overdueCount = assignments.filter(a => a.status === 'active' && isOverdue(a.due_date)).length

  return (
    <div className="space-y-8">
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

      {/* Stats summary */}
      {!loading && assignments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <ClipboardList className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
          </div>
          <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Active</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          </div>
          <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Submissions</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalSubmissions}</p>
          </div>
          <div className="rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{overdueCount}</p>
          </div>
        </div>
      )}

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
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
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
        <div className="space-y-4">
          {assignments.map((a) => {
            const countdown = dueCountdown(a.due_date)
            return (
              <Card key={a.id} className={`rounded-xl ${a.status === 'active' && isOverdue(a.due_date) ? 'border border-red-200/60' : ''}`}>
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">{a.title}</h3>
                        <Badge variant={STATUS_VARIANTS[a.status]} className="capitalize">{a.status}</Badge>
                        {a.status === 'active' && isOverdue(a.due_date) && (
                          <Badge variant="destructive">
                            <AlertTriangle className="mr-1 h-3 w-3" />Overdue
                          </Badge>
                        )}
                      </div>

                      {a.description && (
                        <p className="mb-3 text-sm text-gray-500 line-clamp-2">{a.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <span className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Users className="h-4 w-4 text-gray-400" />
                          {getBatchName(a.batch_id)}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {new Date(a.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className={`flex items-center gap-1.5 text-sm font-medium ${countdown.color}`}>
                          <Timer className="h-4 w-4" />
                          {countdown.text}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Award className="h-4 w-4 text-gray-400" />
                          {a.max_score} pts max
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50/70 px-3 py-1.5">
                          <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                          <span className="text-sm font-semibold text-indigo-700">{a.submission_count}</span>
                          <span className="text-xs text-indigo-500">submissions</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-start shrink-0">
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
            )
          })}
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
