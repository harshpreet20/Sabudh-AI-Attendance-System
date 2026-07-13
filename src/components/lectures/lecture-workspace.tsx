'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabPanel } from '@/components/ui/tabs'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, FileText, Sparkles, ListChecks, HelpCircle, StickyNote, User, MessagesSquare, RefreshCw, Save } from 'lucide-react'
import { SecureMaterialViewer } from './secure-material-viewer'
import { AgentsPanel } from './agents-panel'
import { Whiteboard } from './whiteboard'

interface Material { id: string; title?: string; file_name: string | null; file_type: string | null }
interface Bundle {
  lecture: { id: string; title: string; date: string; teacher_name: string | null }
  is_staff: boolean
  materials: Material[]
  teacher_notes: string
  personal_notes: string
  ai: Record<string, { difficulty: string; payload: unknown; created_at: string }>
  discussion_count: number
}

const DIFFICULTIES = ['easy', 'standard', 'hard'] as const

const TABS = [
  { value: 'materials', label: 'Materials' },
  { value: 'agents', label: 'AI Team' },
  { value: 'summary', label: 'AI Summary' },
  { value: 'takeaways', label: 'Key Takeaways' },
  { value: 'quiz', label: 'Practice Quiz' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'teacher', label: 'Teacher Notes' },
  { value: 'personal', label: 'My Notes' },
  { value: 'discussion', label: 'Discussion' },
]

export function LectureWorkspace({ lectureId, basePath }: { lectureId: string; basePath: string }) {
  const [data, setData] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('materials')
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/lectures/${lectureId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setData(j.data)
          if (j.data.materials.length > 0) setActiveMaterial(j.data.materials[0])
        }
      })
      .finally(() => setLoading(false))
  }, [lectureId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (!data) return <EmptyState title="Lecture unavailable" description="You may not have access to this lecture." icon={FileText} />

  return (
    <div className="space-y-4">
      <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Previous Classes
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.lecture.title}</h1>
        <p className="text-sm text-gray-500">
          {format(parseISO(data.lecture.date), 'd MMMM yyyy')}
          {data.lecture.teacher_name && ` · ${data.lecture.teacher_name}`}
        </p>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} className="overflow-x-auto" />

      <TabPanel value="materials" activeTab={tab}>
        {data.is_staff && (
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setManageOpen(true)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Manage materials
            </Button>
          </div>
        )}
        {data.materials.length === 0 ? (
          <EmptyState title="No materials yet" description={data.is_staff ? 'Use "Manage materials" to attach uploaded files to this lecture.' : 'Materials linked to this lecture will appear here.'} icon={FileText} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="space-y-1">
              {data.materials.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMaterial(m)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm truncate transition ${activeMaterial?.id === m.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50'}`}
                >
                  <FileText className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                  {m.title || m.file_name}
                </button>
              ))}
            </div>
            <Card>
              <CardContent className="p-3">
                {activeMaterial ? <SecureMaterialViewer lectureId={lectureId} material={activeMaterial} /> : null}
                <p className="mt-2 text-center text-[11px] text-gray-400">Content is streamed securely — downloads are disabled.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </TabPanel>

      <TabPanel value="agents" activeTab={tab}>
        <AgentsPanel lectureId={lectureId} />
      </TabPanel>

      <TabPanel value="summary" activeTab={tab}>
        <AiPanel lectureId={lectureId} kind="summary" initial={data.ai.summary} render={renderSummary} icon={Sparkles} label="AI Summary" />
      </TabPanel>
      <TabPanel value="takeaways" activeTab={tab}>
        <AiPanel lectureId={lectureId} kind="takeaways" initial={data.ai.takeaways} render={renderTakeaways} icon={ListChecks} label="Key Takeaways" />
      </TabPanel>
      <TabPanel value="quiz" activeTab={tab}>
        <QuizPanel lectureId={lectureId} initial={data.ai.quiz} />
      </TabPanel>

      <TabPanel value="whiteboard" activeTab={tab}>
        <Whiteboard lectureId={lectureId} canObserve={data.is_staff} />
      </TabPanel>

      <TabPanel value="teacher" activeTab={tab}>
        <NotesPanel lectureId={lectureId} scope="teacher" initial={data.teacher_notes} canEdit={data.is_staff} icon={User} label="Teacher Notes" />
      </TabPanel>
      <TabPanel value="personal" activeTab={tab}>
        <NotesPanel lectureId={lectureId} scope="personal" initial={data.personal_notes} canEdit icon={StickyNote} label="My Notes" />
      </TabPanel>

      <TabPanel value="discussion" activeTab={tab}>
        <Card>
          <CardContent className="p-6 text-center">
            <MessagesSquare className="mx-auto h-8 w-8 text-indigo-400" />
            <p className="mt-2 text-sm text-gray-600">{data.discussion_count} discussion thread{data.discussion_count === 1 ? '' : 's'} for this lecture.</p>
            <Link href={`${basePath.replace(/\/lectures$/, '')}/discussions`}>
              <Button variant="secondary" size="sm" className="mt-3">Open Discussions</Button>
            </Link>
          </CardContent>
        </Card>
      </TabPanel>

      {data.is_staff && (
        <ManageMaterialsDialog lectureId={lectureId} open={manageOpen} onClose={() => setManageOpen(false)} onChanged={load} />
      )}
    </div>
  )
}

// --- Staff: attach/detach batch materials to this lecture ------------------
function ManageMaterialsDialog({ lectureId, open, onClose, onChanged }: { lectureId: string; open: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Array<{ id: string; title?: string; file_name: string | null; file_type?: string | null; session_id: string | null }>>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`/api/lectures/${lectureId}/assign`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setItems(j.data.materials) })
      .finally(() => setLoading(false))
  }, [lectureId])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  async function toggle(materialId: string, attach: boolean) {
    setBusyId(materialId)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId, attach }),
      })
      if (!res.ok) { toast.error('Update failed'); return }
      setItems((prev) => prev.map((m) => (m.id === materialId ? { ...m, session_id: attach ? lectureId : null } : m)))
      // Auto-convert office docs to interactive PDF when attached.
      if (attach) {
        const it = items.find((m) => m.id === materialId)
        const isOffice = /\.(pptx?|docx?)$/i.test(it?.file_name || '') || /(powerpoint|presentation|msword|officedocument)/i.test(it?.file_type || '')
        if (isOffice) fetch(`/api/materials/${materialId}/convert`, { method: 'POST' }).catch(() => {})
      }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manage lecture materials">
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Attach uploaded batch materials to this lecture. Attached files appear in the student workspace.</p>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No materials uploaded for this batch yet. Upload them in Curriculum first.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1">
            {items.map((m) => {
              const attachedHere = m.session_id === lectureId
              const attachedElsewhere = m.session_id && m.session_id !== lectureId
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                  <span className="truncate flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />{m.title || m.file_name}</span>
                  {attachedHere ? (
                    <Button size="sm" variant="secondary" disabled={busyId === m.id} onClick={() => toggle(m.id, false)}>Detach</Button>
                  ) : (
                    <Button size="sm" disabled={busyId === m.id} onClick={() => toggle(m.id, true)} title={attachedElsewhere ? 'Currently attached to another lecture' : ''}>
                      {attachedElsewhere ? 'Move here' : 'Attach'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}

// --- AI content panel (summary / takeaways) --------------------------------
function AiPanel({
  lectureId,
  kind,
  initial,
  render,
  icon: Icon,
  label,
}: {
  lectureId: string
  kind: 'summary' | 'takeaways'
  initial?: { difficulty: string; payload: unknown }
  render: (payload: Record<string, unknown>) => React.ReactNode
  icon: typeof Sparkles
  label: string
}) {
  const [payload, setPayload] = useState<unknown>(initial?.payload ?? null)
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 'standard')
  const [busy, setBusy] = useState(false)

  async function generate(force: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, difficulty, force }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || 'Generation failed')
        return
      }
      setPayload(json.data.payload)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><Icon className="h-4 w-4 text-indigo-500" /> {label}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {DIFFICULTIES.map((d) => (
              <button key={d} onClick={() => setDifficulty(d)} className={`rounded-md px-2.5 py-1 text-xs capitalize ${difficulty === d ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500'}`}>{d}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => generate(!!payload)} loading={busy} disabled={busy}>
            {payload ? <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Generate</>}
          </Button>
        </div>
      </div>
      {payload ? (
        <Card><CardContent className="p-4">{render(payload as Record<string, unknown>)}</CardContent></Card>
      ) : (
        <EmptyState title={`No ${label.toLowerCase()} yet`} description="Generate it from this lecture's materials." icon={Icon} />
      )}
    </div>
  )
}

function list(items: unknown): string[] {
  return Array.isArray(items) ? items.map(String) : []
}
function bullets(items: unknown) {
  const arr = list(items)
  if (arr.length === 0) return null
  return <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">{arr.map((x, i) => <li key={i}>{x}</li>)}</ul>
}
function section(title: string, node: React.ReactNode) {
  if (!node) return null
  return <div className="mb-4"><h4 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h4>{node}</div>
}
function defs(items: unknown) {
  const arr = Array.isArray(items) ? (items as Array<{ term?: string; definition?: string }>) : []
  if (arr.length === 0) return null
  return <dl className="space-y-1.5 text-sm">{arr.map((d, i) => <div key={i}><dt className="font-medium text-gray-900 inline">{d.term}: </dt><dd className="inline text-gray-700">{d.definition}</dd></div>)}</dl>
}

function renderSummary(p: Record<string, unknown>) {
  return (
    <div>
      {p.summary ? <div className="prose prose-sm max-w-none mb-4 whitespace-pre-line text-gray-700">{String(p.summary)}</div> : null}
      {section('Key Concepts', bullets(p.key_concepts))}
      {section('Definitions', defs(p.definitions))}
      {section('Important Questions', bullets(p.important_questions))}
      {section('Revision Notes', bullets(p.revision_notes))}
      {section('Suggested Reading', bullets(p.suggested_reading))}
      {section('Related Topics', bullets(p.related_topics))}
    </div>
  )
}
function renderTakeaways(p: Record<string, unknown>) {
  return (
    <div>
      {section('Learning Objectives', bullets(p.objectives))}
      {section('Critical Concepts', bullets(p.concepts))}
      {section('Formulas', bullets(p.formulas))}
      {section('Definitions', defs(p.definitions))}
      {section('Revision Checklist', bullets(p.checklist))}
    </div>
  )
}

// --- Quiz panel ------------------------------------------------------------
interface QuizQ { id: string; type: string; question: string; options?: string[] }
function QuizPanel({ lectureId, initial }: { lectureId: string; initial?: { difficulty: string; payload: unknown } }) {
  const [payload, setPayload] = useState<{ questions?: QuizQ[] } | null>((initial?.payload as { questions?: QuizQ[] }) ?? null)
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 'standard')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ score: number; total: number; review: Array<{ id: string; correct: boolean; answer: string; explanation: string }> } | null>(null)

  async function generate(force: boolean) {
    setBusy(true); setResult(null); setAnswers({})
    try {
      const res = await fetch(`/api/lectures/${lectureId}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'quiz', difficulty, force }) })
      const json = await res.json()
      if (!res.ok || !json.success) { toast.error(json.error?.message || 'Generation failed'); return }
      setPayload(json.data.payload)
    } finally { setBusy(false) }
  }

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, difficulty }) })
      const json = await res.json()
      if (!res.ok || !json.success) { toast.error(json.error?.message || 'Submit failed'); return }
      setResult(json.data)
      toast.success(`You scored ${json.data.score}/${json.data.total}`)
    } finally { setBusy(false) }
  }

  const reviewById = new Map((result?.review || []).map((r) => [r.id, r]))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><HelpCircle className="h-4 w-4 text-indigo-500" /> Practice Quiz</span>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {DIFFICULTIES.map((d) => <button key={d} onClick={() => setDifficulty(d)} className={`rounded-md px-2.5 py-1 text-xs capitalize ${difficulty === d ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500'}`}>{d}</button>)}
          </div>
          <Button size="sm" onClick={() => generate(!!payload)} loading={busy} disabled={busy}>{payload ? 'Regenerate' : 'Generate'}</Button>
        </div>
      </div>

      {!payload ? (
        <EmptyState title="No quiz yet" description="Generate a practice quiz from this lecture." icon={HelpCircle} />
      ) : (
        <Card><CardContent className="p-4 space-y-4">
          {(payload.questions || []).map((q, idx) => {
            const rev = reviewById.get(q.id)
            return (
              <div key={q.id} className={`rounded-lg border p-3 ${rev ? (rev.correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40') : 'border-gray-200'}`}>
                <p className="text-sm font-medium text-gray-900">{idx + 1}. {q.question}</p>
                <div className="mt-2 space-y-1">
                  {q.type === 'mcq' && (q.options || []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} disabled={!!result} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      {opt}
                    </label>
                  ))}
                  {q.type === 'true_false' && ['True', 'False'].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name={q.id} value={opt.toLowerCase()} checked={answers[q.id] === opt.toLowerCase()} disabled={!!result} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      {opt}
                    </label>
                  ))}
                  {q.type === 'fill_blank' && (
                    <input type="text" placeholder="Your answer" value={answers[q.id] || ''} disabled={!!result} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
                  )}
                </div>
                {rev && (
                  <p className={`mt-2 text-xs ${rev.correct ? 'text-emerald-700' : 'text-red-700'}`}>
                    {rev.correct ? '✓ Correct.' : `✗ Correct answer: ${rev.answer}.`} {rev.explanation}
                  </p>
                )}
              </div>
            )
          })}
          {!result ? (
            <Button onClick={submit} loading={busy} disabled={busy}>Submit answers</Button>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant={result.score / result.total >= 0.6 ? 'success' : 'warning'}>Score: {result.score}/{result.total}</Badge>
              <Button variant="secondary" size="sm" onClick={() => { setResult(null); setAnswers({}) }}>Retry</Button>
            </div>
          )}
        </CardContent></Card>
      )}
    </div>
  )
}

// --- Notes panel (teacher / personal) --------------------------------------
function NotesPanel({ lectureId, scope, initial, canEdit, icon: Icon, label }: { lectureId: string; scope: 'teacher' | 'personal'; initial: string; canEdit: boolean; icon: typeof User; label: string }) {
  const [content, setContent] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, content }) })
      if (!res.ok) { toast.error('Save failed'); return }
      toast.success('Saved')
    } finally { setSaving(false) }
  }

  if (!canEdit) {
    return content ? (
      <Card><CardContent className="p-4 whitespace-pre-line text-sm text-gray-700">{content}</CardContent></Card>
    ) : (
      <EmptyState title={`No ${label.toLowerCase()} yet`} description={scope === 'teacher' ? 'Your instructor hasn\'t added notes for this lecture.' : ''} icon={Icon} />
    )
  }

  return (
    <div className="space-y-2">
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} placeholder={scope === 'teacher' ? 'Add notes, reading resources, homework, announcements…' : 'Your private notes for this lecture (Markdown supported)…'} className="font-mono text-sm" />
      <div className="flex justify-end">
        <Button onClick={save} loading={saving} disabled={saving}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
      </div>
    </div>
  )
}
