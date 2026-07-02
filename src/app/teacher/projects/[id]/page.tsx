'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
  Sparkles,
  Loader2,
  Brain,
  AlertCircle,
} from 'lucide-react'
import type { Project, ProjectSubmission, StudentProfile, ProjectExpertise } from '@/types/database'
import Link from 'next/link'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  submitted: 'default',
  in_review: 'warning',
  graded: 'success',
  returned: 'destructive',
  resubmitted: 'secondary',
}

const EXPERTISE_CONFIG: Record<ProjectExpertise, { label: string; color: string }> = {
  dsa: { label: 'DSA', color: 'bg-amber-100/80 text-amber-700 border-amber-200/50' },
  ml: { label: 'ML', color: 'bg-violet-100/80 text-violet-700 border-violet-200/50' },
  gen_ai: { label: 'Gen AI', color: 'bg-indigo-100/80 text-indigo-700 border-indigo-200/50' },
  data_science: { label: 'Data Science', color: 'bg-teal-100/80 text-teal-700 border-teal-200/50' },
  web_dev: { label: 'Web Dev', color: 'bg-rose-100/80 text-rose-700 border-rose-200/50' },
  general: { label: 'General', color: 'bg-gray-100/80 text-gray-700 border-gray-200/50' },
}

type SubmissionWithStudent = ProjectSubmission & { student?: StudentProfile }

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()

  const [project, setProject] = useState<Project | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([])
  const [loading, setLoading] = useState(true)

  // Grading dialog state
  const [gradeDialog, setGradeDialog] = useState<ProjectSubmission | null>(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '', status: 'graded' as 'graded' | 'returned' })
  const [saving, setSaving] = useState(false)

  // AI assessment state
  const [assessingId, setAssessingId] = useState<string | null>(null)
  const [bulkAssessing, setBulkAssessing] = useState(false)

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
    if (isNaN(score) || score < 0) {
      toast.error('Enter a valid score')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('project_submissions')
      .update({
        score,
        feedback: gradeForm.feedback.trim() || null,
        status: gradeForm.status,
        graded_at: new Date().toISOString(),
      })
      .eq('id', gradeDialog.id)

    if (error) {
      toast.error('Failed to save grade')
    } else {
      toast.success(gradeForm.status === 'returned' ? 'Returned for revision' : 'Graded successfully')
      setGradeDialog(null)
      fetchData()
    }
    setSaving(false)
  }

  async function handleReturn(subId: string) {
    const { error } = await supabase.from('project_submissions').update({ status: 'returned' }).eq('id', subId)
    if (error) toast.error('Failed')
    else { toast.success('Returned for revision'); fetchData() }
  }

  async function runAiAssessment(submissionId: string, projectId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/projects/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, projectId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Assessment failed')
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI assessment failed'
      toast.error(message)
      return false
    }
  }

  async function handleAiAssess(submissionId: string) {
    setAssessingId(submissionId)
    const success = await runAiAssessment(submissionId, id)
    if (success) {
      toast.success('AI assessment completed')
      await fetchData()
    }
    setAssessingId(null)
  }

  async function handleAiAssessInDialog() {
    if (!gradeDialog) return
    setAssessingId(gradeDialog.id)
    const success = await runAiAssessment(gradeDialog.id, id)
    if (success) {
      toast.success('AI assessment completed')
      await fetchData()
      // Refresh the dialog submission data
      const { data } = await supabase
        .from('project_submissions')
        .select('*')
        .eq('id', gradeDialog.id)
        .single()
      if (data) {
        const sub = data as ProjectSubmission
        setGradeDialog(sub)
        if (sub.ai_score != null) {
          setGradeForm(f => ({ ...f, score: String(sub.ai_score) }))
        }
      }
    }
    setAssessingId(null)
  }

  async function handleBulkAssess() {
    const ungraded = submissions.filter(s => s.status !== 'graded' && !s.ai_assessment)
    if (ungraded.length === 0) {
      toast.info('No ungraded submissions without AI assessment')
      return
    }

    setBulkAssessing(true)
    let successCount = 0
    let failCount = 0

    for (const sub of ungraded) {
      const success = await runAiAssessment(sub.id, id)
      if (success) successCount++
      else failCount++
    }

    if (successCount > 0) toast.success(`AI assessed ${successCount} submission${successCount > 1 ? 's' : ''}`)
    if (failCount > 0) toast.error(`${failCount} assessment${failCount > 1 ? 's' : ''} failed`)

    await fetchData()
    setBulkAssessing(false)
  }

  function openGradeDialog(sub: ProjectSubmission) {
    setGradeForm({
      score: sub.score != null ? String(sub.score) : (sub.ai_score != null ? String(sub.ai_score) : ''),
      feedback: sub.feedback ?? '',
      status: 'graded',
    })
    setGradeDialog(sub)
  }

  function getFileIcon(url: string) {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url)) return ImageIcon
    return FileText
  }

  function getFileName(url: string) {
    return url.split('/').pop() ?? 'file'
  }

  function formatAiSummary(assessment: Record<string, unknown>): string {
    if (typeof assessment.summary === 'string') return assessment.summary
    if (typeof assessment.feedback === 'string') return assessment.feedback
    if (typeof assessment.overall_feedback === 'string') return assessment.overall_feedback
    // Fallback: show stringified keys
    const parts: string[] = []
    for (const [key, value] of Object.entries(assessment)) {
      if (key === 'score' || key === 'ai_score') continue
      if (typeof value === 'string') {
        parts.push(value)
        break
      }
    }
    return parts.length > 0 ? parts[0] : 'Assessment complete'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <EmptyState
        icon={FileText}
        title="Project not found"
        action={<Link href="/teacher/projects"><Button>Back to Projects</Button></Link>}
      />
    )
  }

  const gradedCount = submissions.filter(s => s.status === 'graded').length
  const ungradedWithoutAi = submissions.filter(s => s.status !== 'graded' && !s.ai_assessment).length
  const expertiseInfo = EXPERTISE_CONFIG[project.expertise] ?? EXPERTISE_CONFIG.general
  const aiAssessable = ['dsa', 'ml', 'gen_ai', 'data_science', 'web_dev'].includes(project.expertise)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher/projects">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{project.title}</h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${expertiseInfo.color}`}>
                {expertiseInfo.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {project.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Due {new Date(project.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />{project.max_score} pts
              </span>
            </div>
          </div>
        </div>
        <Badge variant={STATUS_VARIANTS[project.status] ?? 'secondary'}>{project.status}</Badge>
      </div>

      {/* Project Details Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {project.description && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Description</p>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
          {project.objectives && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Objectives</p>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.objectives}</p>
            </div>
          )}
          {project.requirements && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ListChecks className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Requirements</p>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.requirements}</p>
            </div>
          )}
          {project.resources && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Resources</p>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.resources}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{submissions.length}</p>
            <p className="text-xs text-gray-500">Submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{gradedCount}</p>
            <p className="text-xs text-gray-500">Graded</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{submissions.length - gradedCount}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Header with Bulk Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Submissions</h2>
        <div className="flex items-center gap-2">
          {!aiAssessable && (
            <p className="text-xs text-gray-400">AI assessment available for: DSA, ML, Gen AI, Data Science, Web Dev</p>
          )}
          {aiAssessable && submissions.length > 0 && ungradedWithoutAi > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkAssess}
              loading={bulkAssessing}
              disabled={bulkAssessing}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Assess All with AI ({ungradedWithoutAi})
            </Button>
          )}
        </div>
      </div>

      {/* Submissions List */}
      {submissions.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No submissions yet"
          description="Students haven't submitted their projects yet."
        />
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => {
            const isAssessing = assessingId === sub.id
            return (
              <Card key={sub.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Avatar
                        src={sub.student?.profile_image_url}
                        fallback={sub.student?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '??'}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{sub.student?.full_name ?? 'Unknown'}</p>
                          <Badge variant={STATUS_VARIANTS[sub.status]}>{sub.status}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          Submitted {new Date(sub.submitted_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>

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
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/50 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-white/70 transition-colors"
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  {getFileName(url)}
                                  <Download className="h-3 w-3" />
                                </a>
                              )
                            })}
                          </div>
                        )}

                        {/* Manual score and feedback */}
                        {sub.score != null && (
                          <p className="mt-2 text-sm font-medium text-indigo-600">
                            Score: {sub.score}/{project.max_score}
                          </p>
                        )}
                        {sub.feedback && (
                          <p className="mt-1 text-sm text-gray-500 italic">&ldquo;{sub.feedback}&rdquo;</p>
                        )}

                        {/* AI Assessment display */}
                        {(sub.ai_score != null || sub.ai_assessment) && (
                          <div className="mt-3 rounded-lg bg-violet-50/60 border border-violet-200/40 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Brain className="h-3.5 w-3.5 text-violet-600" />
                              <p className="text-xs font-medium text-violet-700">AI Assessment</p>
                            </div>
                            {sub.ai_score != null && (
                              <p className="text-sm font-medium text-violet-600">
                                AI Score: {sub.ai_score}/{project.max_score}
                              </p>
                            )}
                            {sub.ai_assessment && (
                              <p className="mt-1 text-sm text-violet-600/80 line-clamp-3">
                                {formatAiSummary(sub.ai_assessment)}
                              </p>
                            )}
                          </div>
                        )}

                        {isAssessing && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-violet-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Running AI assessment...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1 self-end sm:self-start">
                      {aiAssessable && !sub.ai_assessment && sub.status !== 'graded' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAiAssess(sub.id)}
                          disabled={isAssessing || bulkAssessing}
                        >
                          {isAssessing ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 h-3.5 w-3.5" />
                          )}
                          AI
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openGradeDialog(sub)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Grade
                      </Button>
                      {sub.status !== 'returned' && (
                        <Button variant="ghost" size="sm" onClick={() => handleReturn(sub.id)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Grading Dialog */}
      <Dialog
        open={!!gradeDialog}
        onClose={() => setGradeDialog(null)}
        title="Grade Project"
        description={gradeDialog ? `Grading ${submissions.find(s => s.id === gradeDialog.id)?.student?.full_name ?? 'student'}'s submission` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGradeDialog(null)}>Cancel</Button>
            <Button onClick={handleGrade} loading={saving}>Save Grade</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={`Score (0 to ${project.max_score})`}
            type="number"
            min={0}
            max={project.max_score}
            value={gradeForm.score}
            onChange={(e) => setGradeForm(f => ({ ...f, score: e.target.value }))}
            placeholder="0"
          />
          <Textarea
            label="Feedback"
            value={gradeForm.feedback}
            onChange={(e) => setGradeForm(f => ({ ...f, feedback: e.target.value }))}
            placeholder="Project feedback..."
            rows={4}
          />
          <Select
            label="Status"
            value={gradeForm.status}
            onChange={(e) => setGradeForm(f => ({ ...f, status: e.target.value as 'graded' | 'returned' }))}
          >
            <option value="graded">Graded</option>
            <option value="returned">Returned for revision</option>
          </Select>

          {/* AI Assessment in Dialog */}
          <div className="border-t border-white/20 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-violet-500" />
                AI Assessment
              </p>
              {aiAssessable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiAssessInDialog}
                  disabled={assessingId === gradeDialog?.id}
                  loading={assessingId === gradeDialog?.id}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Run AI Assessment
                </Button>
              ) : (
                <span className="text-xs text-gray-400">Not available for General projects</span>
              )}
            </div>

            {gradeDialog?.ai_assessment ? (
              <div className="rounded-lg bg-violet-50/60 border border-violet-200/40 p-3">
                {gradeDialog.ai_score != null && (
                  <p className="text-sm font-medium text-violet-600 mb-1">
                    AI Score: {gradeDialog.ai_score}/{project.max_score}
                  </p>
                )}
                <p className="text-sm text-violet-600/80 whitespace-pre-wrap">
                  {formatAiSummary(gradeDialog.ai_assessment)}
                </p>
              </div>
            ) : assessingId === gradeDialog?.id ? (
              <div className="flex items-center gap-2 rounded-lg bg-violet-50/40 border border-violet-200/30 p-3 text-sm text-violet-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running AI assessment...
              </div>
            ) : (
              <p className="text-sm text-gray-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                No AI assessment yet. Click &quot;Run AI Assessment&quot; to generate one.
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  )
}
