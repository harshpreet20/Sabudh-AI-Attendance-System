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
  FolderKanban,
  Pencil,
  Trash2,
  Eye,
  Calendar,
  Users,
  Target,
} from 'lucide-react'
import type { Project, Batch } from '@/types/database'
import Link from 'next/link'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  active: 'default',
  in_review: 'warning',
  completed: 'success',
  archived: 'destructive',
}

export default function TeacherProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<(Project & { submission_count?: number })[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterBatch, setFilterBatch] = useState('')

  const [form, setForm] = useState({
    batch_id: '',
    title: '',
    description: '',
    objectives: '',
    requirements: '',
    resources: '',
    due_date: '',
    max_score: '100',
    status: 'draft',
  })

  const resetForm = () => {
    setForm({ batch_id: '', title: '', description: '', objectives: '', requirements: '', resources: '', due_date: '', max_score: '100', status: 'draft' })
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

    let query = supabase
      .from('projects')
      .select('*')
      .eq('instructor_id', user.id)
      .order('created_at', { ascending: false })

    if (filterBatch) query = query.eq('batch_id', filterBatch)

    const { data } = await query
    const projectList = (data as Project[]) ?? []

    const withCounts = await Promise.all(
      projectList.map(async (p) => {
        const { count } = await supabase
          .from('project_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', p.id)
        return { ...p, submission_count: count ?? 0 }
      })
    )

    setProjects(withCounts)
    setLoading(false)
  }, [filterBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave() {
    if (!form.batch_id || !form.title.trim()) {
      toast.error('Please fill in batch and title')
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
      objectives: form.objectives.trim() || null,
      requirements: form.requirements.trim() || null,
      resources: form.resources.trim() || null,
      due_date: form.due_date || null,
      max_score: parseInt(form.max_score) || 100,
      status: form.status,
    }

    if (editingId) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editingId)
      if (error) toast.error('Failed to update project')
      else toast.success('Project updated')
    } else {
      const { error } = await supabase.from('projects').insert(payload)
      if (error) toast.error('Failed to create project')
      else toast.success('Project created')
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Project deleted'); fetchData() }
  }

  function handleEdit(p: Project) {
    setForm({
      batch_id: p.batch_id,
      title: p.title,
      description: p.description ?? '',
      objectives: p.objectives ?? '',
      requirements: p.requirements ?? '',
      resources: p.resources ?? '',
      due_date: p.due_date ?? '',
      max_score: String(p.max_score),
      status: p.status,
    })
    setEditingId(p.id)
    setShowDialog(true)
  }

  function getBatchName(id: string) {
    return batches.find(b => b.id === id)?.name ?? 'Unknown'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">Design and manage student projects</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Design your first project for students."
          action={
            <Button onClick={() => { resetForm(); setShowDialog(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardContent className="flex flex-col flex-1 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{p.title}</p>
                      <Badge variant={STATUS_VARIANTS[p.status]}>{p.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{getBatchName(p.batch_id)}</p>
                  </div>
                </div>

                {p.description && (
                  <p className="mt-3 text-sm text-gray-600 line-clamp-2">{p.description}</p>
                )}

                {p.objectives && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Objectives</p>
                    <p className="text-sm text-gray-600 line-clamp-2">{p.objectives}</p>
                  </div>
                )}

                <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/20">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {p.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(p.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {p.submission_count} submissions
                    </span>
                    <span className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      {p.max_score} pts
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link href={`/teacher/projects/${p.id}`}>
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
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
        title={editingId ? 'Edit Project' : 'Design New Project'}
        description={editingId ? 'Update the project details.' : 'Define the project scope and requirements.'}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <Select label="Batch *" value={form.batch_id} onChange={(e) => setForm(f => ({ ...f, batch_id: e.target.value }))}>
            <option value="">Select batch</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input label="Project Title *" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., Build a Weather Dashboard App" />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Overview of the project..." rows={3} />
          <Textarea label="Objectives" value={form.objectives} onChange={(e) => setForm(f => ({ ...f, objectives: e.target.value }))} placeholder="What students should learn and demonstrate..." rows={3} />
          <Textarea label="Requirements" value={form.requirements} onChange={(e) => setForm(f => ({ ...f, requirements: e.target.value }))} placeholder="Technical requirements, deliverables..." rows={3} />
          <Textarea label="Resources" value={form.resources} onChange={(e) => setForm(f => ({ ...f, resources: e.target.value }))} placeholder="Helpful links, documentation, starter code..." rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} />
            <Input label="Max Score" type="number" value={form.max_score} onChange={(e) => setForm(f => ({ ...f, max_score: e.target.value }))} />
          </div>
          <Select label="Status" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed</option>
          </Select>
          <Button onClick={handleSave} loading={saving} className="w-full">
            {editingId ? 'Update Project' : 'Create Project'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
