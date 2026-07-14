'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { format, parseISO } from 'date-fns'
import { BookOpen, Search, FileText, Sparkles, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cacheGet, cacheSet } from '@/lib/device-cache'

interface Lecture {
  id: string
  number: number | null
  title: string
  date: string
  batch_name: string | null
  teacher_name: string | null
  material_count: number
  has_ai: boolean
  attendance: string | null
}

// Previous Classes — a browsable list of completed lectures. Each opens its
// interactive workspace.
export function LecturesList({ basePath }: { basePath: string }) {
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cacheId = `lectures-list:${user?.id || 'anon'}`
    // Instant paint from the device cache, then revalidate.
    const cached = cacheGet<Lecture[]>(cacheId)
    if (cached) { setLectures(cached); setLoading(false) }
    try {
      const j = await fetch('/api/lectures').then((r) => r.json())
      if (j.success) { setLectures(j.data.lectures); cacheSet(cacheId, j.data.lectures) }
    } catch {
      // keep whatever we painted from cache
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? lectures.filter((l) => l.title.toLowerCase().includes(q) || (l.batch_name || '').toLowerCase().includes(q))
    : lectures

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-indigo-500" />
          Previous Classes
        </h1>
        <p className="text-sm text-gray-500">Every completed lecture, as an interactive learning workspace.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search lectures…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No previous classes yet" description="Completed lectures with materials will appear here." icon={BookOpen} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((l) => (
            <Link key={l.id} href={`${basePath}/${l.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-indigo-500">
                        {l.number ? `Lecture ${String(l.number).padStart(2, '0')}` : 'Lecture'}
                      </p>
                      <h3 className="font-semibold text-gray-900 truncate">{l.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(parseISO(l.date), 'd MMM yyyy')}
                        {l.teacher_name && ` · ${l.teacher_name}`}
                      </p>
                    </div>
                    {l.attendance && (
                      <Badge variant={l.attendance === 'present' ? 'success' : 'destructive'}>
                        {l.attendance === 'present' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {l.attendance === 'present' ? 'Present' : 'Absent'}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />{l.material_count} material{l.material_count === 1 ? '' : 's'}</Badge>
                    {l.has_ai && <Badge variant="default"><Sparkles className="h-3 w-3 mr-1" />AI ready</Badge>}
                    {l.batch_name && <Badge variant="outline">{l.batch_name}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
