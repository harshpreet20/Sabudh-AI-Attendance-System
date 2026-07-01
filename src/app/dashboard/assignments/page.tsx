'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ClipboardList,
  Calendar,
  Star,
  Upload,
  FileText,
  X,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react'
import type { Assignment, AssignmentSubmission } from '@/types/database'

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  submitted: 'default',
  graded: 'success',
  returned: 'warning',
  resubmitted: 'secondary',
}

export default function StudentAssignmentsPage() {
  const supabase = createClient()
  const [assignments, setAssignments] = useState<(Assignment & { submission?: AssignmentSubmission })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitDialog, setSubmitDialog] = useState<Assignment | null>(null)
  const [submitContent, setSubmitContent] = useState('')
  const [submitFiles, setSubmitFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
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

    const { data: aData } = await supabase
      .from('assignments')
      .select('*')
      .eq('batch_id', profile.batch_id)
      .in('status', ['active', 'closed'])
      .order('due_date', { ascending: true })

    const assignmentList = (aData as Assignment[]) ?? []

    const withSubs = await Promise.all(
      assignmentList.map(async (a) => {
        const { data: sub } = await supabase
          .from('assignment_submissions')
          .select('*')
          .eq('assignment_id', a.id)
          .eq('student_id', profile.id)
          .single()
        return { ...a, submission: sub as AssignmentSubmission | undefined }
      })
    )

    setAssignments(withSubs)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSubmit() {
    if (!submitDialog || !studentId) return
    if (!submitContent.trim() && submitFiles.length === 0) {
      toast.error('Please add content or upload files')
      return
    }

    setSubmitting(true)

    let fileUrls: string[] = []
    if (submitFiles.length > 0) {
      for (const file of submitFiles) {
        const ext = file.name.split('.').pop()
        const path = `assignments/${submitDialog.id}/${studentId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('uploads').upload(path, file)
        if (error) {
          toast.error(`Failed to upload ${file.name}`)
          setSubmitting(false)
          return
        }
        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path)
        fileUrls.push(publicUrl)
      }
    }

    const existing = assignments.find(a => a.id === submitDialog.id)?.submission
    if (existing) {
      const { error } = await supabase
        .from('assignment_submissions')
        .update({
          content: submitContent.trim() || null,
          file_urls: [...(existing.file_urls ?? []), ...fileUrls],
          status: 'resubmitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) toast.error('Failed to resubmit')
      else toast.success('Resubmitted')
    } else {
      const { error } = await supabase.from('assignment_submissions').insert({
        assignment_id: submitDialog.id,
        student_id: studentId,
        content: submitContent.trim() || null,
        file_urls: fileUrls,
      })
      if (error) toast.error('Failed to submit')
      else toast.success('Assignment submitted')
    }

    setSubmitting(false)
    setSubmitDialog(null)
    setSubmitContent('')
    setSubmitFiles([])
    fetchData()
  }

  function openSubmit(a: Assignment) {
    const existing = assignments.find(x => x.id === a.id)?.submission
    setSubmitContent(existing?.content ?? '')
    setSubmitFiles([])
    setSubmitDialog(a)
  }

  function removeFile(index: number) {
    setSubmitFiles(prev => prev.filter((_, i) => i !== index))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setSubmitFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const isOverdue = (d: string) => new Date(d) < new Date()
  const pending = assignments.filter(a => !a.submission)
  const submitted = assignments.filter(a => a.submission)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <p className="mt-1 text-sm text-gray-500">View and submit your assignments</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments" description="You don't have any assignments yet." />
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider">Pending</h2>
              <div className="space-y-3">
                {pending.map((a) => (
                  <Card key={a.id} className={isOverdue(a.due_date) ? 'border-red-200/50 border' : ''}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{a.title}</p>
                            {isOverdue(a.due_date) && <Badge variant="destructive">Overdue</Badge>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due {new Date(a.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{a.max_score} pts</span>
                          </div>
                          {a.description && <p className="mt-2 text-sm text-gray-500 line-clamp-2">{a.description}</p>}
                        </div>
                        <Button size="sm" onClick={() => openSubmit(a)} className="w-full sm:w-auto" disabled={a.status === 'closed'}>
                          <Send className="mr-1 h-3.5 w-3.5" />Submit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {submitted.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider">Submitted</h2>
              <div className="space-y-3">
                {submitted.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{a.title}</p>
                            <Badge variant={STATUS_VARIANTS[a.submission!.status]}>{a.submission!.status}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Submitted {new Date(a.submission!.submitted_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                            {a.submission!.score != null && (
                              <span className="flex items-center gap-1 font-medium text-indigo-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />{a.submission!.score}/{a.max_score}
                              </span>
                            )}
                          </div>
                          {a.submission!.feedback && (
                            <p className="mt-2 text-sm text-gray-500 italic border-l-2 border-indigo-200 pl-3">{a.submission!.feedback}</p>
                          )}
                          {a.submission!.file_urls && a.submission!.file_urls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {a.submission!.file_urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/50 px-2 py-1 text-xs text-gray-600 hover:bg-white/70">
                                  <FileText className="h-3 w-3" />{url.split('/').pop()?.slice(0, 20)}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {a.submission!.status === 'returned' && (
                          <Button size="sm" variant="outline" onClick={() => openSubmit(a)} className="w-full sm:w-auto">
                            <Send className="mr-1 h-3.5 w-3.5" />Resubmit
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!submitDialog}
        onClose={() => setSubmitDialog(null)}
        title={submitDialog?.title ?? 'Submit Assignment'}
        description={submitDialog ? `Due ${new Date(submitDialog.due_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })} | ${submitDialog.max_score} pts` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}><Send className="mr-1 h-3.5 w-3.5" />Submit</Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitDialog?.description && (
            <div className="rounded-xl bg-indigo-50/50 p-3 text-sm text-gray-600">{submitDialog.description}</div>
          )}
          <Textarea
            label="Your Answer"
            value={submitContent}
            onChange={(e) => setSubmitContent(e.target.value)}
            placeholder="Write your answer, notes, or explanation..."
            rows={5}
          />
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Attachments</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.py,.js,.ts,.jsx,.tsx,.html,.css,.ipynb"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} type="button">
              <Upload className="mr-1 h-3.5 w-3.5" />
              Upload Files
            </Button>
            {submitFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {submitFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-gray-400" /> : <FileText className="h-4 w-4 text-gray-400" />}
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
                    </span>
                    <button onClick={() => removeFile(i)} className="ml-2 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-gray-400">Images, PDFs, documents, code files, screenshots</p>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
