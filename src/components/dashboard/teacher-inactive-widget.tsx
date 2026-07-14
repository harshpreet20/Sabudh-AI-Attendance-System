'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { UserX, Search, Mail, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'

interface InactiveStudent {
  id: string
  full_name: string
  email: string
  batch_name: string | null
}

interface Data {
  summary: { never_logged_in: number; total_students: number }
  students: InactiveStudent[]
}

// Teacher dashboard widget: students in the instructor's own batches who have
// never logged in. Search, select, and re-send their welcome/login email.
export function TeacherInactiveWidget() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [working, setWorking] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/teacher/inactive-students')
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

  async function sendEmail() {
    if (!data || selected.size === 0) {
      toast.error('Select at least one student')
      return
    }
    setWorking(true)
    try {
      const emails = data.students.filter((s) => selected.has(s.id)).map((s) => s.email)
      const res = await fetch('/api/teacher/resend-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to send emails')
        return
      }
      toast.success(json.message || 'Emails sent')
      setSelected(new Set())
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-red-500" />
          Students Who Never Logged In
          <Badge variant="destructive">{data.summary.never_logged_in}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-3">
          {data.summary.never_logged_in} of {data.summary.total_students} of your students haven&apos;t signed in yet.
          Search and re-send their login email.
        </p>

        {data.students.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">All your students have logged in. 🎉</p>
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
              <Button size="sm" onClick={sendEmail} loading={working} disabled={selected.size === 0 || working}>
                <Mail className="h-3.5 w-3.5 mr-1" /> Send login email
              </Button>
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
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
