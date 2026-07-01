'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Calendar,
  Users,
  FileText,
  Download,
  Target,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Image as ImageIcon,
  BookOpen,
  ListChecks,
  Link2,
} from 'lucide-react'
import type { Project, ProjectSubmission, StudentProfile } from '@/types/database'
import Link from 'next/link'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  submitted: 'default',
  in_review: 'warning',
  graded: 'success',
  returned: 'destructive',
  resubmitted: 'secondary',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<Project | null>(null)
  const [submissions, setSubmissions] = useState<(ProjectSubmission & { student?: StudentProfile })[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeDialog, setGradeDialog] = useState<ProjectSubmission | null>(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: pData } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(pData as Project | null)

    if (pData) {
      const { data: subs } = await supabase
        .from('project_submissions')
        .select('*')
        .eq('project_id', id)
        .order('submitted_at', { ascending: false })

      const subList = (subs as ProjectSubmission[]) ?? []
      const studentIds = [...new Set(subList.map(s => s.student_id))]
      let studentMap: Record<string, StudentProfile> = {}
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('student_profiles').select('*').in('id', studentIds)
        if (students) studentMap = Object.fromEntries((students as StudentProfile[]).map(s => [s.id, s]))
      }

      setSubmissions(subList.map(s => ({ ...s, student: studentMap[s.student_id] })))
    }

    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGrade() {
    if (!gradeDialog) return
    const score = parseInt(gradeForm.score)
    if (isNaN(score) || score < 0) { toast.error('Enter a valid score'); return }

    setSaving(true)
    const { error } = await supabase
      .from('project_submissions')
      .update({ score, feedback: gradeForm.feedback.trim() || null, status: 'graded', graded_at: new Date().toISOString() })
      .eq('id', gradeDialog.id)

    if (error) toast.error('Failed to grade')
    else { toast.success('Graded'); setGradeDialog(null); fetchData() }
    setSaving(false)
  }

  async function handleReturn(subId: string) {
    const { error } = await supabase.from('project_submissions').update({ status: 'returned' }).eq('id', subId)
    if (error) toast.error('Failed')
    else { toast.success('Returned for revision'); fetchData() }
  }

  function getFileIcon(url: string) {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url)) return ImageIcon
    return FileText
  }

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  if (!project) return <EmptyState icon={FileText} title="Project not found" action={<Link href="/teacher/projects"><Button>Back to Projects</Button></Link>} />

  const gradedCount = submissions.filter(s => s.status === 'graded').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher/projects"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{project.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {project.due_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(project.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>}
              <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{project.max_score} pts</span>
            </div>
          </div>
        </div>
        <Badge variant={STATUS_VARIANTS[project.status] ?? 'secondary'}>{project.status}</Badge>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {project.description && (
            <div>
              <div className="flex items-center gap-2 mb-1"><BookOpen className="h-4 w-4 text-gray-400" /><p className="text-sm font-medium text-gray-700">Description</p></div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
          {project.objectives && (
            <div>
              <div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4 text-gray-400" /><p className="text-sm font-medium text-gray-700">Objectives</p></div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.objectives}</p>
            </div>
          )}
          {project.requirements && (
            <div>
              <div className="flex items-center gap-2 mb-1"><ListChecks className="h-4 w-4 text-gray-400" /><p className="text-sm font-medium text-gray-700">Requirements</p></div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.requirements}</p>
            </div>
          )}
          {project.resources && (
            <div>
              <div className="flex items-center gap-2 mb-1"><Link2 className="h-4 w-4 text-gray-400" /><p className="text-sm font-medium text-gray-700">Resources</p></div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.resources}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-gray-900">{submissions.length}</p><p className="text-xs text-gray-500">Submissions</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{gradedCount}</p><p className="text-xs text-gray-500">Graded</p></CardContent></Card>
        <Card className="col-span-2 sm:col-span-1"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{submissions.length - gradedCount}</p><p className="text-xs text-gray-500">Pending</p></CardContent></Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Submissions</h2>
        {submissions.length === 0 ? (
          <EmptyState icon={Users} title="No submissions yet" description="Students haven't submitted their projects yet." />
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
              <Card key={sub.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Avatar src={sub.student?.profile_image_url} fallback={sub.student?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '??'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{sub.student?.full_name ?? 'Unknown'}</p>
                          <Badge variant={STATUS_VARIANTS[sub.status]}>{sub.status}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">Submitted {new Date(sub.submitted_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

                        {sub.title && <p className="mt-2 font-medium text-sm text-gray-800">{sub.title}</p>}
                        {sub.content && <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{sub.content}</p>}
                        {sub.demo_url && (
                          <a href={sub.demo_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-500">
                            <ExternalLink className="h-3.5 w-3.5" />Demo Link
                          </a>
                        )}
                        {sub.file_urls && sub.file_urls.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sub.file_urls.map((url, i) => {
                              const Icon = getFileIcon(url)
                              return (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/50 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-white/70">
                                  <Icon className="h-3.5 w-3.5" />{url.split('/').pop()}<Download className="h-3 w-3" />
                                </a>
                              )
                            })}
                          </div>
                        )}
                        {sub.score != null && <p className="mt-2 text-sm font-medium text-indigo-600">Score: {sub.score}/{project.max_score}</p>}
                        {sub.feedback && <p className="mt-1 text-sm text-gray-500 italic">&ldquo;{sub.feedback}&rdquo;</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-start">
                      <Button variant="outline" size="sm" onClick={() => { setGradeForm({ score: sub.score != null ? String(sub.score) : '', feedback: sub.feedback ?? '' }); setGradeDialog(sub) }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Grade
                      </Button>
                      {sub.status !== 'returned' && <Button variant="ghost" size="sm" onClick={() => handleReturn(sub.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!gradeDialog} onClose={() => setGradeDialog(null)} title="Grade Project" footer={<><Button variant="secondary" onClick={() => setGradeDialog(null)}>Cancel</Button><Button onClick={handleGrade} loading={saving}>Save Grade</Button></>}>
        <div className="space-y-4">
          <Input label={`Score (out of ${project.max_score})`} type="number" min={0} max={project.max_score} value={gradeForm.score} onChange={(e) => setGradeForm(f => ({ ...f, score: e.target.value }))} />
          <Textarea label="Feedback" value={gradeForm.feedback} onChange={(e) => setGradeForm(f => ({ ...f, feedback: e.target.value }))} placeholder="Project feedback..." rows={4} />
        </div>
      </Dialog>
    </div>
  )
}
