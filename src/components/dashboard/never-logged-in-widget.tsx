'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { UserX, Download, Bell, Ban, Archive, Trash2, CheckSquare, Square, Search, Mail } from 'lucide-react'
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

type BulkAction = 'suspend' | 'archive' | 'delete' | 'remind'

const ACTION_META: Record<BulkAction, { label: string; verb: string; destructive: boolean; needsConfirm: boolean }> = {
  remind: { label: 'Remind', verb: 'send a login reminder to', destructive: false, needsConfirm: false },
  suspend: { label: 'Suspend', verb: 'suspend', destructive: true, needsConfirm: true },
  archive: { label: 'Archive', verb: 'archive', destructive: true, needsConfirm: true },
  delete: { label: 'Delete', verb: 'permanently delete', destructive: true, needsConfirm: true },
}

// Admin dashboard widget: students who have never signed in even once. Search
// the list, select recipients, and re-send their welcome/login email — plus
// bulk remind / suspend / archive / delete and a CSV download.
export function NeverLoggedInWidget() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<BulkAction | null>(null)
  const [reason, setReason] = useState('')
  const [working, setWorking] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/inactive-users')
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

  function selectedEmails(): string[] {
    if (!data) return []
    return data.students.filter((s) => selected.has(s.id)).map((s) => s.email)
  }

  async function runBulk(action: BulkAction) {
    if (selected.size === 0) return
    setWorking(true)
    try {
      const res = await fetch('/api/admin/inactive-users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, student_ids: Array.from(selected), reason: reason.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || 'Bulk action failed')
        return
      }
      toast.success(json.data.message)
      setSelected(new Set())
      setReason('')
      setConfirm(null)
      // Reminders don't change the roster; status/delete actions do.
      if (action !== 'remind') load()
    } finally {
      setWorking(false)
    }
  }

  async function runEmail() {
    if (selected.size === 0) {
      toast.error('Select at least one student')
      return
    }
    setWorking(true)
    try {
      const res = await fetch('/api/admin/bulk-resend-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: selectedEmails() }),
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

  function requestAction(action: BulkAction) {
    if (selected.size === 0) {
      toast.error('Select at least one student')
      return
    }
    if (ACTION_META[action].needsConfirm) setConfirm(action)
    else runBulk(action)
  }

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data) return null

  const pct = data.summary.total_students > 0
    ? Math.round((data.summary.never_logged_in / data.summary.total_students) * 100)
    : 0
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id))

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
          <>
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Select-all + bulk action toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2 border-b border-white/20 pb-2">
              <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                {allSelected ? <CheckSquare className="h-4 w-4 text-indigo-500" /> : <Square className="h-4 w-4" />}
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </button>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="secondary" disabled={selected.size === 0 || working} onClick={runEmail}>
                  <Mail className="h-3.5 w-3.5 mr-1" /> Send email
                </Button>
                <Button size="sm" variant="secondary" disabled={selected.size === 0 || working} onClick={() => requestAction('remind')}>
                  <Bell className="h-3.5 w-3.5 mr-1" /> Remind
                </Button>
                <Button size="sm" variant="secondary" disabled={selected.size === 0 || working} onClick={() => requestAction('suspend')}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Suspend
                </Button>
                <Button size="sm" variant="secondary" disabled={selected.size === 0 || working} onClick={() => requestAction('archive')}>
                  <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                </Button>
                <Button size="sm" variant="destructive" disabled={selected.size === 0 || working} onClick={() => requestAction('delete')}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
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
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Confirmation dialog for destructive bulk actions */}
      <Dialog
        open={confirm !== null}
        onClose={() => { if (!working) { setConfirm(null); setReason('') } }}
        title={confirm ? `${ACTION_META[confirm].label} ${selected.size} student${selected.size === 1 ? '' : 's'}?` : ''}
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              You&apos;re about to {ACTION_META[confirm].verb}{' '}
              <strong>{selected.size}</strong> student{selected.size === 1 ? '' : 's'} who have never logged in.
              {confirm === 'delete' && ' This permanently removes their accounts and cannot be undone. Accounts that have actually logged in are automatically skipped.'}
              {confirm === 'suspend' && ' They will be blocked from signing in until restored.'}
              {confirm === 'archive' && ' They will be moved out of active rosters.'}
            </p>
            {(confirm === 'suspend' || confirm === 'archive') && (
              <Textarea
                placeholder="Reason (optional) — included in the notification and audit log"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setConfirm(null); setReason('') }} disabled={working}>
                Cancel
              </Button>
              <Button
                variant={ACTION_META[confirm].destructive ? 'destructive' : 'default'}
                loading={working}
                disabled={working}
                onClick={() => runBulk(confirm)}
              >
                {ACTION_META[confirm].label} {selected.size}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
