'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FolderKanban,
  Calendar,
  Target,
  Upload,
  FileText,
  X,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Send,
  ExternalLink,
  BookOpen,
  ListChecks,
  Link2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  Filter,
} from 'lucide-react'
import type { Project, ProjectSubmission, ProjectExpertise } from '@/types/database'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  submitted: 'default',
  in_review: 'warning',
  graded: 'success',
  returned: 'destructive',
  resubmitted: 'secondary',
}

const EXPERTISE_CONFIG: Record<ProjectExpertise, { label: string; color: string }> = {
  dsa: { label: 'DSA', color: 'bg-amber-100/80 text-amber-700 border border-amber-200/50' },
  ml: { label: 'ML', color: 'bg-violet-100/80 text-violet-700 border border-violet-200/50' },
  gen_ai: { label: 'Gen AI', color: 'bg-indigo-100/80 text-indigo-700 border border-indigo-200/50' },
  data_science: { label: 'Data Science', color: 'bg-teal-100/80 text-teal-700 border border-teal-200/50' },
  web_dev: { label: 'Web Dev', color: 'bg-rose-100/80 text-rose-700 border border-rose-200/50' },
  general: { label: 'General', color: 'bg-gray-100/80 text-gray-700 border border-gray-200/50' },
}

const EXPERTISE_GUIDANCE: Record<ProjectExpertise, string> = {
  dsa: 'Submit your algorithm implementation. Include source code files and complexity analysis.',
  ml: 'Submit your ML model. Include notebooks, trained model files, and evaluation metrics.',
  gen_ai: 'Submit your Gen AI project. Include prompts, notebooks, and output samples.',
  data_science: 'Submit your data analysis. Include notebooks, datasets, and visualizations.',
  web_dev: 'Submit your web project. Include source code, screenshots, and demo link.',
  general: 'Submit your project files and documentation.',
}

export default function StudentProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<(Project & { submission?: ProjectSubmission })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitDialog, setSubmitDialog] = useState<Project | null>(null)
  const [form, setForm] = useState({ title: '', content: '', demo_url: '' })
  const [submitFiles, setSubmitFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [aiExpandedId, setAiExpandedId] = useState<string | null>(null)
  const [expertiseFilter, setExpertiseFilter] = useState<ProjectExpertise | 'all'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile?.batch_id) { setLoading(false); return }
    setStudentId(profile.id)

    const { data: pData } = await supabase
      .from('projects')
      .select('*')
      .eq('batch_id', profile.batch_id)
      .in('status', ['active', 'in_review', 'completed'])
      .order('created_at', { ascending: false })

    const projectList = (pData as Project[]) ?? []

    const withSubs = await Promise.all(
      projectList.map(async (p) => {
        const { data: sub } = await supabase
          .from('project_submissions')
          .select('*')
          .eq('project_id', p.id)
          .eq('student_id', profile.id)
          .single()
        return { ...p, submission: sub as ProjectSubmission | undefined }
      })
    )

    setProjects(withSubs)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const filteredProjects = expertiseFilter === 'all'
    ? projects
    : projects.filter(p => p.expertise === expertiseFilter)

  function getAcceptAttr(project: Project): string | undefined {
    if (!project.allowed_file_types || project.allowed_file_types.length === 0) {
      return undefined
    }
    return project.allowed_file_types.join(',')
  }

  async function handleSubmit() {
    if (!submitDialog || !studentId) return
    if (!form.content.trim() && submitFiles.length === 0) {
      toast.error('Please add content or upload files')
      return
    }

    setSubmitting(true)

    let fileUrls: string[] = []
    for (const file of submitFiles) {
      const ext = file.name.split('.').pop()
      const path = `projects/${submitDialog.id}/${studentId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('uploads').upload(path, file)
      if (error) { toast.error(`Failed to upload ${file.name}`); setSubmitting(false); return }
      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path)
      fileUrls.push(publicUrl)
    }

    const existing = projects.find(p => p.id === submitDialog.id)?.submission
    if (existing) {
      const { error } = await supabase
        .from('project_submissions')
        .update({
          title: form.title.trim() || null,
          content: form.content.trim() || null,
          demo_url: form.demo_url.trim() || null,
          file_urls: [...(existing.file_urls ?? []), ...fileUrls],
          status: 'resubmitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) toast.error('Failed to resubmit')
      else toast.success('Project resubmitted')
    } else {
      const { error } = await supabase.from('project_submissions').insert({
        project_id: submitDialog.id,
        student_id: studentId,
        title: form.title.trim() || null,
        content: form.content.trim() || null,
        demo_url: form.demo_url.trim() || null,
        file_urls: fileUrls,
      })
      if (error) toast.error('Failed to submit')
      else toast.success('Project submitted')
    }

    setSubmitting(false)
    setSubmitDialog(null)
    setForm({ title: '', content: '', demo_url: '' })
    setSubmitFiles([])
    fetchData()
  }

  function openSubmit(p: Project) {
    const existing = projects.find(x => x.id === p.id)?.submission
    setForm({
      title: existing?.title ?? '',
      content: existing?.content ?? '',
      demo_url: existing?.demo_url ?? '',
    })
    setSubmitFiles([])
    setSubmitDialog(p)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <p className="mt-1 text-sm text-gray-500">View project briefs and submit your work</p>
      </div>

      {/* Expertise filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <Select
          value={expertiseFilter}
          onChange={(e) => setExpertiseFilter(e.target.value as ProjectExpertise | 'all')}
          className="max-w-[200px]"
        >
          <option value="all">All Expertise</option>
          <option value="dsa">DSA</option>
          <option value="ml">ML</option>
          <option value="gen_ai">Gen AI</option>
          <option value="data_science">Data Science</option>
          <option value="web_dev">Web Dev</option>
          <option value="general">General</option>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filteredProjects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects" description={expertiseFilter === 'all' ? 'No projects assigned to your batch yet.' : `No ${EXPERTISE_CONFIG[expertiseFilter].label} projects found.`} />
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((p) => {
            const expertiseCfg = EXPERTISE_CONFIG[p.expertise] ?? EXPERTISE_CONFIG.general

            return (
              <Card key={p.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{p.title}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${expertiseCfg.color}`}>
                          {expertiseCfg.label}
                        </span>
                        <Badge variant={STATUS_VARIANTS[p.status] ?? 'secondary'}>{p.status}</Badge>
                        {p.submission && <Badge variant={STATUS_VARIANTS[p.submission.status]}>{p.submission.status}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        {p.due_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(p.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>}
                        <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{p.max_score} pts</span>
                        {p.submission?.score != null && <span className="flex items-center gap-1 font-medium text-indigo-600"><CheckCircle2 className="h-3.5 w-3.5" />{p.submission.score}/{p.max_score}</span>}
                        {p.submission?.ai_score != null && (
                          <span className="flex items-center gap-1 font-medium text-violet-600">
                            <Sparkles className="h-3.5 w-3.5" />AI: {p.submission.ai_score}/{p.max_score}
                          </span>
                        )}
                      </div>

                      {p.description && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{p.description}</p>}

                      {expandedId === p.id && (
                        <div className="mt-3 space-y-3 border-t border-white/20 pt-3">
                          {p.objectives && <div><div className="flex items-center gap-1.5 mb-1"><BookOpen className="h-3.5 w-3.5 text-gray-400" /><p className="text-xs font-medium text-gray-500">Objectives</p></div><p className="text-sm text-gray-600 whitespace-pre-wrap">{p.objectives}</p></div>}
                          {p.requirements && <div><div className="flex items-center gap-1.5 mb-1"><ListChecks className="h-3.5 w-3.5 text-gray-400" /><p className="text-xs font-medium text-gray-500">Requirements</p></div><p className="text-sm text-gray-600 whitespace-pre-wrap">{p.requirements}</p></div>}
                          {p.resources && <div><div className="flex items-center gap-1.5 mb-1"><Link2 className="h-3.5 w-3.5 text-gray-400" /><p className="text-xs font-medium text-gray-500">Resources</p></div><p className="text-sm text-gray-600 whitespace-pre-wrap">{p.resources}</p></div>}

                          {p.submission?.feedback && <p className="text-sm text-gray-500 italic border-l-2 border-indigo-200 pl-3">{p.submission.feedback}</p>}

                          {/* AI Assessment section */}
                          {p.submission?.ai_assessment && Object.keys(p.submission.ai_assessment).length > 0 && (
                            <div className="rounded-xl border border-violet-200/50 bg-violet-50/50 p-3">
                              <button
                                onClick={() => setAiExpandedId(aiExpandedId === p.id ? null : p.id)}
                                className="flex w-full items-center justify-between text-left"
                              >
                                <span className="flex items-center gap-2 text-sm font-medium text-violet-700">
                                  <Brain className="h-4 w-4" />
                                  AI Assessment
                                </span>
                                {aiExpandedId === p.id ? (
                                  <ChevronUp className="h-4 w-4 text-violet-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-violet-400" />
                                )}
                              </button>
                              {aiExpandedId === p.id && (
                                <div className="mt-3 space-y-2 text-sm text-gray-700">
                                  {Object.entries(p.submission.ai_assessment).map(([key, value]) => (
                                    <div key={key}>
                                      <span className="font-medium text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                                      <span className="text-gray-600">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {p.submission?.file_urls && p.submission.file_urls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {p.submission.file_urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/50 px-2 py-1 text-xs text-gray-600 hover:bg-white/70">
                                  <FileText className="h-3 w-3" />{url.split('/').pop()?.slice(0, 20)}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="mt-2 text-xs text-indigo-600 hover:text-indigo-500">
                        {expandedId === p.id ? 'Show less' : 'View details'}
                      </button>
                    </div>

                    <div className="self-end sm:self-start">
                      {!p.submission ? (
                        <Button size="sm" onClick={() => openSubmit(p)} className="w-full sm:w-auto">
                          <Send className="mr-1 h-3.5 w-3.5" />Submit
                        </Button>
                      ) : p.submission.status === 'returned' ? (
                        <Button size="sm" variant="outline" onClick={() => openSubmit(p)} className="w-full sm:w-auto">
                          <Send className="mr-1 h-3.5 w-3.5" />Resubmit
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!submitDialog}
        onClose={() => setSubmitDialog(null)}
        title={submitDialog?.title ?? 'Submit Project'}
        description={submitDialog?.due_date ? `Due ${new Date(submitDialog.due_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'No deadline'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}><Send className="mr-1 h-3.5 w-3.5" />Submit</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Expertise-specific guidance */}
          {submitDialog && (
            <div className="rounded-xl bg-indigo-50/60 border border-indigo-100/50 px-4 py-3 text-sm text-indigo-700">
              {EXPERTISE_GUIDANCE[submitDialog.expertise] ?? EXPERTISE_GUIDANCE.general}
            </div>
          )}

          <Input label="Project Title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Your project name" />
          <Textarea label="Description / Notes" value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Describe your project, approach, key features..." rows={5} />
          <Input label="Demo URL (optional)" value={form.demo_url} onChange={(e) => setForm(f => ({ ...f, demo_url: e.target.value }))} placeholder="https://your-demo-link.com" />
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Files & Screenshots</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={submitDialog ? getAcceptAttr(submitDialog) : undefined}
              onChange={(e) => { if (e.target.files) setSubmitFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} type="button">
              <Upload className="mr-1 h-3.5 w-3.5" />Upload Files
            </Button>
            {submitDialog?.allowed_file_types && submitDialog.allowed_file_types.length > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                Accepted: {submitDialog.allowed_file_types.join(', ')}
              </p>
            )}
            {submitFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {submitFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-gray-400" /> : <FileText className="h-4 w-4 text-gray-400" />}
                      <span className="truncate">{file.name}</span>
                    </span>
                    <button onClick={() => setSubmitFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-2 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
