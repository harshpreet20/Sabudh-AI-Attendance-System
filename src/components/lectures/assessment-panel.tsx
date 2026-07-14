'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { HelpCircle, ShieldAlert, Clock, Camera, Mic, Eye, Trophy, AlertTriangle } from 'lucide-react'
import { useProctor, type ProctorFlag } from './use-proctor'

const DIFFICULTIES = ['easy', 'standard', 'hard'] as const

interface Q { id: string; type: string; question: string; options?: string[]; topic?: string }
interface Review { id: string; correct: boolean; answer: string; explanation: string; topic?: string }
interface Attempt { id: string; difficulty: string; score: number | null; total: number; status: string; flags: number; submitted_at: string | null }
interface RosterRow { name: string; score: number; total: number; flags: number }

function fmt(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

export function AssessmentPanel({ lectureId, isStaff }: { lectureId: string; isStaff: boolean }) {
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro')
  const [difficulty, setDifficulty] = useState('standard')
  const [reviewed, setReviewed] = useState(false)
  const [useCam, setUseCam] = useState(true)
  const [useMic, setUseMic] = useState(true)
  const [busy, setBusy] = useState(false)

  const [aid, setAid] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [duration, setDuration] = useState(0)
  const [flagCount, setFlagCount] = useState(0)
  const [lastFlag, setLastFlag] = useState('')
  const [result, setResult] = useState<{ score: number; total: number; review: Review[] } | null>(null)

  const [best, setBest] = useState(0)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [coverage, setCoverage] = useState<number | null>(null)

  const aidRef = useRef<string | null>(null)
  useEffect(() => { aidRef.current = aid }, [aid])

  const onFlag = useCallback((f: ProctorFlag) => {
    setFlagCount((c) => c + 1)
    setLastFlag(f.type.replace(/_/g, ' '))
    if (aidRef.current) {
      fetch(`/api/lectures/${lectureId}/assessment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'event', assessment_id: aidRef.current, event_type: f.type, severity: f.severity, details: f.details || {} }),
      }).catch(() => {})
    }
  }, [lectureId])

  const { containerRef, videoRef, cameraOn, micOn, start: startProctor, stop: stopProctor } = useProctor(onFlag)

  const loadPerf = useCallback(async () => {
    try {
      const j = await fetch(`/api/lectures/${lectureId}/assessment`).then((r) => r.json())
      if (j.success) { setBest(j.data.best_pct || 0); setAttempts(j.data.attempts || []); setRoster(j.data.roster || []) }
    } catch { /* ignore */ }
  }, [lectureId])

  useEffect(() => { loadPerf() }, [loadPerf])

  useEffect(() => {
    fetch(`/api/lectures/${lectureId}/coverage`).then((r) => r.json())
      .then((j) => { if (j.success) setCoverage(j.data.total > 0 ? j.data.pct : null) })
      .catch(() => {})
  }, [lectureId])

  const submit = useCallback(async (auto: boolean) => {
    const id = aidRef.current
    if (!id) return
    setBusy(true)
    try {
      const j = await fetch(`/api/lectures/${lectureId}/assessment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', assessment_id: id, answers, auto }),
      }).then((r) => r.json())
      if (!j.success) { toast.error(j.error?.message || 'Submit failed'); return }
      stopProctor()
      setResult(j.data); setPhase('done')
      toast[auto ? 'message' : 'success'](auto ? 'Time up — submitted automatically.' : `Scored ${j.data.score}/${j.data.total}`)
      loadPerf()
    } finally { setBusy(false) }
  }, [answers, lectureId, stopProctor, loadPerf])

  // Countdown.
  useEffect(() => {
    if (phase !== 'running') return
    if (timeLeft <= 0) { submit(true); return }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, timeLeft, submit])

  async function generateQuiz() {
    setBusy(true)
    try {
      const j = await fetch(`/api/lectures/${lectureId}/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'quiz', difficulty, force: true }),
      }).then((r) => r.json())
      if (!j.success) { toast.error(j.error?.message || 'Generation failed'); return }
      toast.success('Quiz ready')
    } finally { setBusy(false) }
  }

  async function start() {
    setBusy(true)
    try {
      const j = await fetch(`/api/lectures/${lectureId}/assessment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', difficulty, camera: useCam, mic: useMic }),
      }).then((r) => r.json())
      if (!j.success) { toast.error(j.error?.message || 'Could not start'); return }
      setAid(j.data.assessment_id); aidRef.current = j.data.assessment_id
      setQuestions(j.data.questions || [])
      setAnswers({}); setResult(null); setFlagCount(0); setLastFlag('')
      setDuration(j.data.duration_seconds); setTimeLeft(j.data.duration_seconds)
      setPhase('running')
      await startProctor({ camera: useCam, mic: useMic })
    } finally { setBusy(false) }
  }

  // --- INTRO --------------------------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><HelpCircle className="h-4 w-4 text-indigo-500" /> Assessment</span>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {DIFFICULTIES.map((d) => (
              <button key={d} onClick={() => setDifficulty(d)} className={`rounded-md px-2.5 py-1 text-xs capitalize ${difficulty === d ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-gray-500'}`}>{d}</button>
            ))}
          </div>
        </div>

        {(best > 0 || attempts.length > 0) && (
          <Card><CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-gray-700"><Trophy className="h-4 w-4 text-amber-500" /> Your best: <strong>{best}%</strong></span>
            <span className="text-sm text-gray-500">{attempts.length} attempt{attempts.length === 1 ? '' : 's'}</span>
          </CardContent></Card>
        )}

        <Card><CardContent className="p-4 space-y-3">
          <p className="text-sm text-gray-600">This assessment covers all topics of the lecture. Once you start, a timer begins and questions are locked in — you can’t pause. Please review the material first.</p>

          {coverage !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Topics covered (slides you’ve read)</span>
                <span className={`font-medium tabular-nums ${coverage >= 80 ? 'text-emerald-600' : coverage >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{coverage}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className={`h-2 rounded-full transition-all duration-500 ${coverage >= 80 ? 'bg-emerald-500' : coverage >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${coverage}%` }} />
              </div>
              {coverage < 80 && <p className="text-[11px] text-amber-600">You’ve covered {coverage}% of the material — consider finishing the slides before you start.</p>}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <span>I have read and reviewed the lecture material (slides / summary / notes).</span>
          </label>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4" /> Proctored</div>
            <p className="mt-1">The assessment opens in fullscreen and monitors focus, copy/paste, and (with your permission) your camera and microphone. Leaving fullscreen or switching tabs is flagged for review.</p>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={useCam} onChange={(e) => setUseCam(e.target.checked)} /> <Camera className="h-3.5 w-3.5" /> Camera</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} /> <Mic className="h-3.5 w-3.5" /> Microphone</label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={start} loading={busy} disabled={busy || !reviewed}>
              <Clock className="h-3.5 w-3.5 mr-1" /> Start assessment
            </Button>
            {isStaff && (
              <Button variant="secondary" onClick={generateQuiz} loading={busy} disabled={busy}>Prepare / regenerate quiz</Button>
            )}
          </div>
        </CardContent></Card>

        {isStaff && roster.length > 0 && (
          <Card><CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Class results</p>
            <div className="space-y-1">
              {roster.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{i + 1}. {r.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-gray-600">{r.total ? Math.round((r.score / r.total) * 100) : 0}%</span>
                    {r.flags > 0 && <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />{r.flags}</Badge>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        )}
      </div>
    )
  }

  // --- RUNNING ------------------------------------------------------------
  if (phase === 'running') {
    const pct = duration ? (timeLeft / duration) * 100 : 0
    const low = timeLeft <= 30
    return (
      <div ref={containerRef} className="space-y-3 bg-white select-none" onContextMenu={(e) => e.preventDefault()}>
        <div className="sticky top-0 z-10 space-y-2 bg-white pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`flex items-center gap-1.5 font-mono text-lg font-bold ${low ? 'text-red-600' : 'text-gray-900'}`}><Clock className="h-4 w-4" /> {fmt(timeLeft)}</span>
            <div className="flex items-center gap-2">
              {cameraOn && <span className="flex items-center gap-1 text-xs text-emerald-600"><Camera className="h-3.5 w-3.5" /> on</span>}
              {micOn && <span className="flex items-center gap-1 text-xs text-emerald-600"><Mic className="h-3.5 w-3.5" /> on</span>}
              {flagCount > 0 && <Badge variant="warning"><Eye className="mr-1 h-3 w-3" /> {flagCount}</Badge>}
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200"><div className={`h-1.5 rounded-full transition-all ${low ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} /></div>
          {lastFlag && <p className="text-[11px] text-amber-600">Flagged: {lastFlag} — stay in fullscreen and keep this tab focused.</p>}
        </div>

        {/* Self-view */}
        {cameraOn && (
          <video ref={videoRef} data-proctor autoPlay muted playsInline className="absolute right-3 top-12 z-20 h-24 w-32 rounded-lg border border-gray-200 object-cover shadow" />
        )}

        <Card><CardContent className="p-4 space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{idx + 1}. {q.question}</p>
                {q.topic && <Badge variant="secondary" className="shrink-0 text-[10px]">{q.topic}</Badge>}
              </div>
              <div className="mt-2 space-y-1">
                {q.type === 'mcq' && (q.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} /> {opt}
                  </label>
                ))}
                {q.type === 'true_false' && ['True', 'False'].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name={q.id} value={opt.toLowerCase()} checked={answers[q.id] === opt.toLowerCase()} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} /> {opt}
                  </label>
                ))}
                {q.type === 'fill_blank' && (
                  <input type="text" placeholder="Your answer" value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
                )}
              </div>
            </div>
          ))}
          <Button onClick={() => submit(false)} loading={busy} disabled={busy}>Submit assessment</Button>
        </CardContent></Card>
      </div>
    )
  }

  // --- DONE ---------------------------------------------------------------
  const reviewById = new Map((result?.review || []).map((r) => [r.id, r]))
  const passed = result && result.total ? result.score / result.total >= 0.6 : false
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant={passed ? 'success' : 'warning'}>Score: {result?.score}/{result?.total}</Badge>
          {flagCount > 0 && <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" /> {flagCount} flag{flagCount === 1 ? '' : 's'}</Badge>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setPhase('intro'); setResult(null) }}>Try again</Button>
      </CardContent></Card>

      {(result?.review || []).length > 0 && (
        <Card><CardContent className="p-4 space-y-3">
          {questions.map((q, idx) => {
            const rev = reviewById.get(q.id)
            if (!rev) return null
            return (
              <div key={q.id} className={`rounded-lg border p-3 ${rev.correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{idx + 1}. {q.question}</p>
                  {rev.topic && <Badge variant="secondary" className="shrink-0 text-[10px]">{rev.topic}</Badge>}
                </div>
                <p className={`mt-1 text-xs ${rev.correct ? 'text-emerald-700' : 'text-red-700'}`}>
                  {rev.correct ? '✓ Correct.' : `✗ Correct answer: ${rev.answer}.`} {rev.explanation}
                </p>
              </div>
            )
          })}
        </CardContent></Card>
      )}
      {!result && <EmptyState title="No result" description="Something went wrong." icon={HelpCircle} />}
    </div>
  )
}
