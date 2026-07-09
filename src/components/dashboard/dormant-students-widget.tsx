'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { MoonStar, Search, Mail, BellRing, CheckSquare, Square, Clock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface PreviewSample {
  theme: string
  title: string
  body: string
}

interface DormantStudent {
  id: string
  full_name: string
  email: string
  batch_name: string | null
  last_seen: string | null
  hours_since: number
}

interface Data {
  summary: { dormant: number; total_active: number }
  students: DormantStudent[]
}

function ago(hours: number): string {
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Admin dashboard section: active students whose last seen is > 48 hours ago.
// Search, select, and re-engage them with a push nudge (in-app + browser/PWA)
// or a "come back" email.
export function DormantStudentsWidget() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [working, setWorking] = useState<'nudge' | 'email' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewAi, setPreviewAi] = useState(true)
  const [samples, setSamples] = useState<PreviewSample[]>([])

  async function loadPreview() {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setSamples([])
    try {
      const res = await fetch('/api/admin/engagement-preview')
      const json = await res.json()
      if (json.success) {
        setSamples(json.data.samples)
        setPreviewAi(json.data.ai)
      } else {
        toast.error('Failed to generate preview')
      }
    } catch {
      toast.error('Failed to generate preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/dormant-students')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.students
    return data.students.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    )
  }, [data, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const allSel = filtered.length > 0 && filtered.every((s) => selected.has(s.id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSel) filtered.forEach((s) => next.delete(s.id))
      else filtered.forEach((s) => next.add(s.id))
      return next
    })
  }

  async function act(action: 'nudge' | 'email') {
    if (selected.size === 0) {
      toast.error('Select at least one student')
      return
    }
    setWorking(action)
    try {
      const res = await fetch('/api/admin/dormant-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, student_ids: Array.from(selected) }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || 'Action failed')
        return
      }
      toast.success(json.data.message)
      setSelected(new Set())
    } finally {
      setWorking(null)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <MoonStar className="h-5 w-5 text-amber-500" />
            Inactive 48h+
            <Badge variant="warning">{data.summary.dormant}</Badge>
          </span>
          <Button size="sm" variant="secondary" onClick={loadPreview}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Preview AI nudge
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-3">
          {data.summary.dormant} active students haven&apos;t been seen in over 48 hours. Nudge them back with a push or email.
        </p>

        {data.students.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Everyone&apos;s been active recently. 🎉</p>
        ) : (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap mb-2 border-b border-white/20 pb-2">
              <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                {allSelected ? <CheckSquare className="h-4 w-4 text-indigo-500" /> : <Square className="h-4 w-4" />}
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </button>
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => act('nudge')} loading={working === 'nudge'} disabled={selected.size === 0 || working !== null}>
                  <BellRing className="h-3.5 w-3.5 mr-1" /> Push nudge
                </Button>
                <Button size="sm" variant="secondary" onClick={() => act('email')} loading={working === 'email'} disabled={selected.size === 0 || working !== null}>
                  <Mail className="h-3.5 w-3.5 mr-1" /> Email
                </Button>
              </div>
            </div>

            <div className="space-y-1 max-h-80 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No students match &quot;{search}&quot;.</p>
              ) : (
                filtered.map((s) => {
                  const isSel = selected.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-2 text-left text-sm rounded-lg px-2 py-1.5 transition-colors ${isSel ? 'bg-indigo-50/60' : 'hover:bg-white/40'}`}
                    >
                      {isSel ? <CheckSquare className="h-4 w-4 shrink-0 text-indigo-500" /> : <Square className="h-4 w-4 shrink-0 text-gray-300" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{s.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {s.email}
                          {s.batch_name && ` · ${s.batch_name}`}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="h-3 w-3" />
                        {ago(s.hours_since)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="AI nudge preview">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Sample re-engagement notifications {previewAi ? 'generated live by AI' : '(templated — set OPENAI_API_KEY for AI copy)'}.
            Tone and language vary every send.
          </p>
          {previewLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            samples.map((s, i) => (
              <div key={i} className="rounded-xl border border-white/30 bg-white/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{s.title}</p>
                  <Badge variant="secondary">{s.theme.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-sm text-gray-700 mt-1">{s.body}</p>
              </div>
            ))
          )}
          <div className="flex justify-between items-center pt-1">
            <Button size="sm" variant="secondary" onClick={loadPreview} loading={previewLoading} disabled={previewLoading}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Regenerate
            </Button>
            <Button size="sm" onClick={() => setPreviewOpen(false)}>Close</Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}
