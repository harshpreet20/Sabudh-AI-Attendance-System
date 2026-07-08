'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserX, Download, Bell } from 'lucide-react'
import { toast } from 'sonner'

interface InactiveStudent {
  id: string
  full_name: string
  email: string
  batch_name: string | null
  created_at: string
}

interface Data {
  summary: { never_logged_in: number; total_students: number }
  students: InactiveStudent[]
}

// Admin dashboard widget: students who have never signed in even once. Includes
// a CSV download of the full "non-serious users" list and a nudge action.
export function NeverLoggedInWidget() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [nudged, setNudged] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/inactive-users')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function nudge(s: InactiveStudent) {
    setNudged((prev) => new Set(prev).add(s.id))
    await fetch('/api/admin/notify-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: s.id,
        title: 'Please log in to Sabudh AI',
        message: 'You haven\'t logged in yet. Please sign in to mark attendance and access your course.',
        type: 'info',
      }),
    }).catch(() => {})
    toast.success(`Reminder sent to ${s.full_name}`)
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const pct = data.summary.total_students > 0
    ? Math.round((data.summary.never_logged_in / data.summary.total_students) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-red-500" />
            Never Logged In
            <Badge variant="destructive">{data.summary.never_logged_in}</Badge>
          </span>
          <a href="/api/admin/inactive-users?format=csv">
            <Button size="sm" variant="secondary">
              <Download className="h-3.5 w-3.5 mr-1" /> Download sheet
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-3">
          {data.summary.never_logged_in} of {data.summary.total_students} students ({pct}%) have not signed in even once.
        </p>
        {data.students.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Everyone has logged in at least once. 🎉</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.students.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm border-b border-white/20 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {s.email}
                    {s.batch_name && ` · ${s.batch_name}`}
                  </p>
                </div>
                <Button size="sm" variant="secondary" disabled={nudged.has(s.id)} onClick={() => nudge(s)}>
                  <Bell className="h-3.5 w-3.5 mr-1" />
                  {nudged.has(s.id) ? 'Sent' : 'Remind'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
