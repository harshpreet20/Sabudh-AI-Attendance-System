'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { diffWords, applyDecisions } from '@/lib/text-diff'
import { cacheGet, cacheSet } from '@/lib/device-cache'
import { SlidePlayerProvider } from './slide-player'
import { AssessmentPanel } from './assessment-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabPanel } from '@/components/ui/tabs'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, FileText, Sparkles, ListChecks, HelpCircle, StickyNote, User, MessagesSquare, RefreshCw, Save, GitCompare } from 'lucide-react'
import dynamic from 'next/dynamic'

// Heavy, tab-scoped components are code-split so the workspace opens fast: the
// PDF/office viewer (pdfjs), the AI Team panel, and the collaborative whiteboard
// only download when their tab is actually opened.
const SecureMaterialViewer = dynamic(() => import('./secure-material-viewer').then((m) => m.SecureMaterialViewer), {
  ssr: false, loading: () => <Skeleton className="h-96 w-full" />,
})
const AgentsPanel = dynamic(() => import('./agents-panel').then((m) => m.AgentsPanel), {
  ssr: false, loading: () => <Skeleton className="h-64 w-full" />,
})
const Whiteboard = dynamic(() => import('./whiteboard').then((m) => m.Whiteboard), {
  ssr: false, loading: () => <Skeleton className="h-[60vh] w-full" />,
})

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

interface AiBroadcast { kind: string; difficulty: string; payload: unknown }

// AI content is cached lecture-wide (per kind+difficulty) on the server, so it
// is generated once and shared. This hook adds LIVE sync: when any viewer
// generates content, everyone else watching the lecture receives it immediately
// — no reload, and no one else spends tokens regenerating the same thing.
function useAiSync(lectureId: string, onRemote: (m: AiBroadcast) => void) {
  const chanRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const cbRef = useRef(onRemote)
  useEffect(() => { cbRef.current = onRemote })
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`lec-ai:${lectureId}`)
    ch.on('broadcast', { event: 'ai' }, ({ payload }) => cbRef.current(payload as AiBroadcast)).subscribe()
    chanRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [lectureId])
  return useCallback((m: AiBroadcast) => {
    chanRef.current?.send({ type: 'broadcast', event: 'ai', payload: m })
  }, [])
}

const TABS = [
  { value: 'materials', label: 'Materials' },
  { value: 'agents', label: 'AI Team' },
  { value: 'summary', label: 'AI Summary' },
  { value: 'takeaways', label: 'Key Takeaways' },
  { value: 'quiz', label: 'Assessment' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'teacher', label: 'Teacher Notes' },
  { value: 'personal', label: 'My Notes' },
  { value: 'discussion', label: 'Discussion' },
]

export function LectureWorkspace({ lectureId, basePath }: { lectureId: string; basePath: string }) {
  const supabase = useRef(createClient()).current
  const [data, setData] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('materials')
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const applyBundle = useCallback((bundle: Bundle) => {
    setData(bundle)
    // Keep the current selection on background refresh; only default on first load.
    setActiveMaterial((prev) => prev ?? (bundle.materials.length > 0 ? bundle.materials[0] : null))
  }, [])

  // Stale-while-revalidate: paint the last-seen version instantly from the
  // device cache, then refresh from the network. Makes revisits feel instant.
  const load = useCallback(async (cacheFirst = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    const cacheId = `lecture:${user?.id || 'anon'}:${lectureId}`
    if (cacheFirst) {
      const cached = cacheGet<Bundle>(cacheId)
      if (cached) { applyBundle(cached); setLoading(false) }
    }
    try {
      const j = await fetch(`/api/lectures/${lectureId}`).then((r) => r.json())
      if (j.success) { applyBundle(j.data); cacheSet(cacheId, j.data) }
    } finally {
      setLoading(false)
    }
  }, [lectureId, supabase, applyBundle])

  useEffect(() => {
    load(true)
  }, [load])

  if (loading) return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (!data) return <EmptyState title="Lecture unavailable" description="You may not have access to this lecture." icon={FileText} />

  return (
    <SlidePlayerProvider>
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
        <AiPanel lectureId={lectureId} kind="summary" initial={data.ai.summary} render={renderSummary} icon={Sparkles} label="AI Summary" isStaff={data.is_staff} />
      </TabPanel>
      <TabPanel value="takeaways" activeTab={tab}>
        <AiPanel lectureId={lectureId} kind="takeaways" initial={data.ai.takeaways} render={renderTakeaways} icon={ListChecks} label="Key Takeaways" isStaff={data.is_staff} />
      </TabPanel>
      <TabPanel value="quiz" activeTab={tab}>
        <AssessmentPanel lectureId={lectureId} isStaff={data.is_staff} />
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
    </SlidePlayerProvider>
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
      // Auto-convert office docs to interactive PDF when attached, then build
      // the interactive study content (office prepares after conversion;
      // PDFs/others can prepare right away).
      if (attach) {
        const it = items.find((m) => m.id === materialId)
        const isOffice = /\.(pptx?|docx?)$/i.test(it?.file_name || '') || /(powerpoint|presentation|msword|officedocument)/i.test(it?.file_type || '')
        if (isOffice) fetch(`/api/materials/${materialId}/convert`, { method: 'POST' }).catch(() => {})
        else fetch(`/api/lectures/${lectureId}/prepare`, { method: 'POST' }).catch(() => {})
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
  isStaff,
}: {
  lectureId: string
  kind: 'summary' | 'takeaways'
  initial?: { difficulty: string; payload: unknown }
  render: (payload: Record<string, unknown>) => React.ReactNode
  icon: typeof Sparkles
  label: string
  isStaff: boolean
}) {
  const [payload, setPayload] = useState<unknown>(initial?.payload ?? null)
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 'standard')
  const [busy, setBusy] = useState(false)

  const broadcast = useAiSync(lectureId, (m) => {
    if (m.kind === kind && m.difficulty === difficulty) setPayload(m.payload)
  })

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
      // Share the freshly generated content with everyone viewing this lecture.
      if (!json.data.cached) broadcast({ kind, difficulty, payload: json.data.payload })
    } finally {
      setBusy(false)
    }
  }

  // Only staff may regenerate (it re-spends tokens); students consume the
  // shared copy. Anyone can trigger the first generation when none exists yet.
  const canRegenerate = isStaff

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
          {(!payload || canRegenerate) && (
            <Button size="sm" onClick={() => generate(!!payload)} loading={busy} disabled={busy}>
              {payload ? <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Generate</>}
            </Button>
          )}
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

// --- Notes panel (teacher / personal) --------------------------------------
function NotesPanel({ lectureId, scope, initial, canEdit, icon: Icon, label }: { lectureId: string; scope: 'teacher' | 'personal'; initial: string; canEdit: boolean; icon: typeof User; label: string }) {
  const [baseline, setBaseline] = useState(initial) // last saved version
  const [draft, setDraft] = useState(initial)       // working copy in the textarea
  const [saving, setSaving] = useState(false)
  const [track, setTrack] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  async function persist(content: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, content }) })
      if (!res.ok) { toast.error('Save failed'); return false }
      setBaseline(content)
      setDraft(content)
      setReviewing(false)
      toast.success('Saved')
      return true
    } finally { setSaving(false) }
  }

  if (!canEdit) {
    return baseline ? (
      <Card><CardContent className="p-4 whitespace-pre-line text-sm text-gray-700">{baseline}</CardContent></Card>
    ) : (
      <EmptyState title={`No ${label.toLowerCase()} yet`} description={scope === 'teacher' ? 'Your instructor hasn\'t added notes for this lecture.' : ''} icon={Icon} />
    )
  }

  const hasChanges = draft !== baseline

  if (reviewing) {
    return <NotesReview baseline={baseline} draft={draft} saving={saving} onCancel={() => setReviewing(false)} onSave={persist} />
  }

  return (
    <div className="space-y-2">
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} placeholder={scope === 'teacher' ? 'Add notes, reading resources, homework, announcements…' : 'Your private notes for this lecture (Markdown supported)…'} className="font-mono text-sm" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="rounded border-gray-300" />
          Track changes
          <span className="text-gray-400">— review each edit before saving</span>
        </label>
        {track ? (
          <Button onClick={() => setReviewing(true)} disabled={!hasChanges} title={hasChanges ? '' : 'No changes to review'}>
            <GitCompare className="h-3.5 w-3.5 mr-1" /> Review changes
          </Button>
        ) : (
          <Button onClick={() => persist(draft)} loading={saving} disabled={saving || !hasChanges}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
        )}
      </div>
    </div>
  )
}

// Track-changes review: shows the word-level diff between the saved note and the
// draft; each insertion/deletion can be accepted or rejected before saving.
function NotesReview({ baseline, draft, saving, onCancel, onSave }: { baseline: string; draft: string; saving: boolean; onCancel: () => void; onSave: (content: string) => Promise<boolean> }) {
  const ops = useMemo(() => diffWords(baseline, draft), [baseline, draft])
  const [decisions, setDecisions] = useState<Record<number, 'accept' | 'reject'>>({})
  const changeIdx = ops.map((o, i) => (o.type === 'equal' ? -1 : i)).filter((i) => i >= 0)
  const pending = changeIdx.length

  const decide = (i: number, d: 'accept' | 'reject') => setDecisions((p) => ({ ...p, [i]: d }))
  const setAll = (d: 'accept' | 'reject') => setDecisions(Object.fromEntries(changeIdx.map((i) => [i, d])))
  const result = applyDecisions(ops, decisions)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><GitCompare className="h-4 w-4 text-indigo-500" /> Review changes <Badge variant="secondary">{pending} change{pending === 1 ? '' : 's'}</Badge></span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setAll('accept')}>Accept all</Button>
          <Button size="sm" variant="secondary" onClick={() => setAll('reject')}>Reject all</Button>
        </div>
      </div>

      <Card><CardContent className="p-4">
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
          {ops.map((op, i) => {
            if (op.type === 'equal') return <span key={i} className="text-gray-700">{op.text}</span>
            const d = decisions[i] ?? 'accept'
            if (op.type === 'insert') {
              const kept = d === 'accept'
              return <span key={i} onClick={() => decide(i, kept ? 'reject' : 'accept')} title={kept ? 'Added — click to reject' : 'Rejected addition — click to accept'}
                className={`cursor-pointer rounded px-0.5 ${kept ? 'bg-emerald-100 text-emerald-800 underline decoration-emerald-400' : 'bg-gray-100 text-gray-400 line-through'}`}>{op.text}</span>
            }
            const removed = d === 'accept'
            return <span key={i} onClick={() => decide(i, removed ? 'reject' : 'accept')} title={removed ? 'Removed — click to keep' : 'Kept — click to remove'}
              className={`cursor-pointer rounded px-0.5 ${removed ? 'bg-red-100 text-red-700 line-through' : 'bg-amber-100 text-amber-800'}`}>{op.text}</span>
          })}
        </p>
      </CardContent></Card>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">Green = added · red = removed · click any change to flip accept/reject.</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Back to edit</Button>
          <Button size="sm" onClick={() => onSave(result)} loading={saving} disabled={saving}><Save className="h-3.5 w-3.5 mr-1" /> Save reviewed</Button>
        </div>
      </div>
    </div>
  )
}
