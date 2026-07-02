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
  X,
} from 'lucide-react'
import type { Project, Batch, ProjectExpertise } from '@/types/database'
import Link from 'next/link'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  active: 'default',
  in_review: 'warning',
  completed: 'success',
  archived: 'destructive',
}

const EXPERTISE_OPTIONS: { value: ProjectExpertise; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'dsa', label: 'Data Structures & Algorithms' },
  { value: 'ml', label: 'Machine Learning' },
  { value: 'gen_ai', label: 'Generative AI' },
  { value: 'data_science', label: 'Data Science' },
  { value: 'web_dev', label: 'Web Development' },
]

const EXPERTISE_LABELS: Record<ProjectExpertise, string> = {
  general: 'General',
  dsa: 'DSA',
  ml: 'ML',
  gen_ai: 'Gen AI',
  data_science: 'Data Science',
  web_dev: 'Web Dev',
}

const EXPERTISE_COLORS: Record<ProjectExpertise, string> = {
  dsa: 'bg-amber-100/80 text-amber-700 border border-amber-200/50',
  ml: 'bg-violet-100/80 text-violet-700 border border-violet-200/50',
  gen_ai: 'bg-indigo-100/80 text-indigo-700 border border-indigo-200/50',
  data_science: 'bg-teal-100/80 text-teal-700 border border-teal-200/50',
  web_dev: 'bg-rose-100/80 text-rose-700 border border-rose-200/50',
  general: 'bg-gray-100/80 text-gray-700 border border-gray-200/50',
}

const EXPERTISE_FILE_TYPES: Record<ProjectExpertise, string[]> = {
  dsa: ['.py', '.java', '.cpp', '.c', '.js', '.ts'],
  ml: ['.py', '.ipynb', '.csv', '.pkl', '.h5', '.joblib'],
  gen_ai: ['.py', '.ipynb', '.json', '.yaml', '.txt'],
  data_science: ['.py', '.ipynb', '.csv', '.xlsx', '.sql', '.r'],
  web_dev: ['.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.json'],
  general: [],
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
  const [filterExpertise, setFilterExpertise] = useState('')
  const [fileTypeInput, setFileTypeInput] = useState('')

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
    expertise: 'general' as ProjectExpertise,
    allowed_file_types: [] as string[],
  })

  const resetForm = () => {
    setForm({
      batch_id: '',
      title: '',
      description: '',
      objectives: '',
      requirements: '',
      resources: '',
      due_date: '',
      max_score: '100',
      status: 'draft',
      expertise: 'general',
      allowed_file_types: [],
    })
    setEditingId(null)
    setFileTypeInput('')
  }

  function handleExpertiseChange(expertise: ProjectExpertise) {
    const defaults = EXPERTISE_FILE_TYPES[expertise] ?? []
    setForm(f => ({ ...f, expertise, allowed_file_types: defaults }))
  }

  function addFileType(ext: string) {
    const normalized = ext.startsWith('.') ? ext.toLowerCase().trim() : `.${ext.toLowerCase().trim()}`
    if (!normalized || normalized === '.') return
    if (form.allowed_file_types.includes(normalized)) return
    setForm(f => ({ ...f, allowed_file_types: [...f.allowed_file_types, normalized] }))
    setFileTypeInput('')
  }

  function removeFileType(ext: string) {
    setForm(f => ({ ...f, allowed_file_types: f.allowed_file_types.filter(t => t !== ext) }))
  }

  function handleFileTypeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (fileTypeInput.trim()) {
        addFileType(fileTypeInput.trim())
      }
    }
    if (e.key === 'Backspace' && !fileTypeInput && form.allowed_file_types.length > 0) {
      removeFileType(form.allowed_file_types[form.allowed_file_types.length - 1])
    }
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
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterBatch) query = query.eq('batch_id', filterBatch)
    if (filterExpertise) query = query.eq('expertise', filterExpertise)

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
  }, [filterBatch, filterExpertise]) // eslint-disable-line react-hooks/exhaustive-deps

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
      expertise: form.expertise,
      allowed_file_types: form.allowed_file_types,
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
      expertise: p.expertise ?? 'general',
      allowed_file_types: p.allowed_file_types ?? [],
    })
    setEditingId(p.id)
    setFileTypeInput('')
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
        <Select value={filterExpertise} onChange={(e) => setFilterExpertise(e.target.value)}>
          <option value="">All Expertise</option>
          {EXPERTISE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
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
                      {p.expertise && p.expertise !== 'general' && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${EXPERTISE_COLORS[p.expertise]}`}>
                          {EXPERTISE_LABELS[p.expertise]}
                        </span>
                      )}
                      {p.expertise === 'general' && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${EXPERTISE_COLORS.general}`}>
                          {EXPERTISE_LABELS.general}
                        </span>
                      )}
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

                {p.allowed_file_types && p.allowed_file_types.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.allowed_file_types.slice(0, 5).map(ft => (
                      <span key={ft} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 font-mono">
                        {ft}
                      </span>
                    ))}
                    {p.allowed_file_types.length > 5 && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500">
                        +{p.allowed_file_types.length - 5} more
                      </span>
                    )}
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

          <Select
            label="Expertise Category"
            value={form.expertise}
            onChange={(e) => handleExpertiseChange(e.target.value as ProjectExpertise)}
          >
            {EXPERTISE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>

          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Allowed File Types
            </label>
            <p className="mb-2 text-xs text-gray-500">
              {form.expertise === 'general'
                ? 'All file types accepted. Add specific types to restrict.'
                : 'Pre-populated based on expertise. Add or remove as needed.'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl p-2 glass-input min-h-[2.5rem]">
              {form.allowed_file_types.map(ft => (
                <span
                  key={ft}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-100/80 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200/50"
                >
                  <span className="font-mono">{ft}</span>
                  <button
                    type="button"
                    onClick={() => removeFileType(ft)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-200/60 transition-colors"
                    aria-label={`Remove ${ft}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={fileTypeInput}
                onChange={(e) => setFileTypeInput(e.target.value)}
                onKeyDown={handleFileTypeKeyDown}
                onBlur={() => {
                  if (fileTypeInput.trim()) addFileType(fileTypeInput.trim())
                }}
                placeholder={form.allowed_file_types.length === 0 ? 'Type extension and press Enter (e.g. .py)' : 'Add more...'}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none border-none p-1"
              />
            </div>
          </div>

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
