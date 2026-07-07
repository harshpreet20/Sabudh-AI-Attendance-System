'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Megaphone, Pencil, Trash2, Pin, Search, Users, Globe } from 'lucide-react'
import type { Announcement, Batch } from '@/types/database'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const PRIORITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  low: 'secondary',
  normal: 'default',
  high: 'warning',
  urgent: 'destructive',
}

export default function AdminAnnouncementsPage() {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Map batch_id -> batch name for display
  const [batchMap, setBatchMap] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    batch_id: '',
    title: '',
    content: '',
    priority: 'normal',
    is_pinned: false,
  })

  const resetForm = () => {
    setForm({ batch_id: '', title: '', content: '', priority: 'normal', is_pinned: false })
    setEditingId(null)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Admin sees ALL batches (not just their own)
    const { data: allBatches } = await supabase
      .from('batches')
      .select('*')
      .order('name')

    const batchList = (allBatches as Batch[]) ?? []
    setBatches(batchList)

    const map: Record<string, string> = {}
    for (const b of batchList) {
      map[b.id] = b.name
    }
    setBatchMap(map)

    // Admin sees ALL announcements across all authors and batches
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })

    setAnnouncements((data as Announcement[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Please fill in title and content')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      organization_id: ORG_ID,
      batch_id: form.batch_id || null,
      author_id: user.id,
      title: form.title.trim(),
      content: form.content.trim(),
      priority: form.priority,
      is_pinned: form.is_pinned,
    }

    if (editingId) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editingId)
      if (error) toast.error('Failed to update announcement')
      else toast.success('Announcement updated')
    } else {
      const { error } = await supabase.from('announcements').insert(payload)
      if (error) toast.error('Failed to create announcement')
      else {
        toast.success('Announcement published')
        void fetch('/api/announcements/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_id: payload.batch_id,
            title: payload.title,
            content: payload.content,
          }),
        }).catch(() => {})
      }
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('announcements').delete().eq('id', deleteTarget.id)
    if (error) toast.error('Failed to delete announcement')
    else {
      toast.success('Announcement deleted')
      fetchData()
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  function handleEdit(a: Announcement) {
    setForm({
      batch_id: a.batch_id ?? '',
      title: a.title,
      content: a.content,
      priority: a.priority,
      is_pinned: a.is_pinned,
    })
    setEditingId(a.id)
    setShowDialog(true)
  }

  function getBatchName(batchId: string | null) {
    if (!batchId) return 'All Users'
    return batchMap[batchId] ?? 'Unknown Batch'
  }

  const filtered = announcements.filter((a) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      a.title.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      getBatchName(a.batch_id).toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage platform-wide announcements for all users
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          New Announcement
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={search ? 'No matching announcements' : 'No announcements yet'}
          description={
            search
              ? 'Try a different search term.'
              : 'Create your first announcement to notify users across the platform.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.is_pinned && <Pin className="h-4 w-4 text-indigo-500 shrink-0" />}
                      <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                      <Badge variant={PRIORITY_VARIANT[a.priority] ?? 'secondary'}>
                        {a.priority}
                      </Badge>
                      <Badge variant={a.batch_id ? 'secondary' : 'default'}>
                        {a.batch_id ? (
                          <><Users className="mr-1 h-3 w-3" />{getBatchName(a.batch_id)}</>
                        ) : (
                          <><Globe className="mr-1 h-3 w-3" />All Users</>
                        )}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">
                      {a.content}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                      <span>
                        {new Date(a.published_at).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingId ? 'Edit Announcement' : 'New Announcement'}
        description={
          editingId
            ? 'Update the announcement details.'
            : 'Write an announcement visible to all users or a specific batch.'
        }
      >
        <div className="space-y-4">
          <Input
            label="Title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Platform Maintenance Notice"
          />
          <Textarea
            label="Content *"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write your announcement here..."
            rows={5}
          />
          <Select
            label="Target Audience"
            value={form.batch_id}
            onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))}
          >
            <option value="">All Users (Platform-wide)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
              className="rounded border-gray-300"
            />
            Pin this announcement
          </label>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : editingId ? 'Update Announcement' : 'Publish Announcement'}
          </Button>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Announcement"
        description="Are you sure you want to delete this announcement? This action cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-gray-600">
            &ldquo;{deleteTarget.title}&rdquo; will be permanently removed.
          </p>
        )}
      </Dialog>
    </div>
  )
}
