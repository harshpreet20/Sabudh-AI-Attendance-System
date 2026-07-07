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
  Star,
  CheckCircle2,
  Clock,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react'
import type { Assignment, AssignmentSubmission, StudentProfile } from '@/types/database'
import Link from 'next/link'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  submitted: 'default',
  graded: 'success',
  returned: 'warning',
  resubmitted: 'secondary',
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<(AssignmentSubmission & { student?: StudentProfile })[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeDialog, setGradeDialog] = useState<AssignmentSubmission | null>(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: aData } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', id)
      .single()

    setAssignment(aData as Assignment | null)

    if (aData) {
      const { data: subs } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', id)
        .order('submitted_at', { ascending: false })

      const subList = (subs as AssignmentSubmission[]) ?? []

      const studentIds = [...new Set(subList.map(s => s.student_id))]
      let studentMap: Record<string, StudentProfile> = {}
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from('student_profiles')
          .select('*')
          .in('id', studentIds)
        if (students) {
          studentMap = Object.fromEntries((students as StudentProfile[]).map(s => [s.id, s]))
        }
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
      toast.error('Please enter a valid score')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('assignment_submissions')
      .update({
        score,
        feedback: gradeForm.feedback.trim() || null,
        status: 'graded',
        graded_at: new Date().toISOString(),
      })
      .eq('id', gradeDialog.id)

    if (error) toast.error('Failed to grade')
    else {
      toast.success('Submission graded')
      void fetch('/api/assignments/notify-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: gradeDialog.id }),
      }).catch(() => {})
      setGradeDialog(null)
      setGradeForm({ score: '', feedback: '' })
      fetchData()
    }
    setSaving(false)
  }

  async function handleReturn(subId: string) {
    const { error } = await supabase
      .from('assignment_submissions')
      .update({ status: 'returned' })
      .eq('id', subId)

    if (error) toast.error('Failed')
    else { toast.success('Returned for revision'); fetchData() }
  }

  function openGrade(sub: AssignmentSubmission) {
    setGradeForm({ score: sub.score != null ? String(sub.score) : '', feedback: sub.feedback ?? '' })
    setGradeDialog(sub)
  }

  function getFileIcon(url: string) {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url)) return ImageIcon
    return FileText
  }

  function getFileName(url: string) {
    return url.split('/').pop() ?? 'file'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <EmptyState
        icon={FileText}
        title="Assignment not found"
        action={<Link href="/teacher/assignments"><Button>Back to Assignments</Button></Link>}
      />
    )
  }

  const gradedCount = submissions.filter(s => s.status === 'graded').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher/assignments">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{assignment.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(assignment.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />Max {assignment.max_score} pts</span>
            </div>
          </div>
        </div>
        <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>{assignment.status}</Badge>
      </div>

      {assignment.description && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{assignment.description}</p>
          </CardContent>
        </Card>
      )}

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

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Submissions</h2>
        {submissions.length === 0 ? (
          <EmptyState icon={Users} title="No submissions yet" description="Students haven't submitted their work yet." />
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
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

                        {sub.content && (
                          <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{sub.content}</p>
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

                        {sub.score != null && (
                          <p className="mt-2 text-sm font-medium text-indigo-600">
                            Score: {sub.score}/{assignment.max_score}
                          </p>
                        )}
                        {sub.feedback && (
                          <p className="mt-1 text-sm text-gray-500 italic">&ldquo;{sub.feedback}&rdquo;</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-start">
                      <Button variant="outline" size="sm" onClick={() => openGrade(sub)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Grade
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
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!gradeDialog}
        onClose={() => setGradeDialog(null)}
        title="Grade Submission"
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
            label={`Score (out of ${assignment.max_score})`}
            type="number"
            min={0}
            max={assignment.max_score}
            value={gradeForm.score}
            onChange={(e) => setGradeForm(f => ({ ...f, score: e.target.value }))}
            placeholder="0"
          />
          <Textarea
            label="Feedback (optional)"
            value={gradeForm.feedback}
            onChange={(e) => setGradeForm(f => ({ ...f, feedback: e.target.value }))}
            placeholder="Write feedback for the student..."
            rows={4}
          />
        </div>
      </Dialog>
    </div>
  )
}
