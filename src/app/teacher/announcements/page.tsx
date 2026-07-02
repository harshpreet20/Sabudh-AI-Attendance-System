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
import { Plus, Megaphone, Pencil, Trash2, Pin } from 'lucide-react'
import type { Announcement, Batch } from '@/types/database'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const PRIORITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  low: 'secondary',
  normal: 'default',
  high: 'warning',
  urgent: 'destructive',
}

export default function TeacherAnnouncementsPage() {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')

    setBatches((myBatches as Batch[]) ?? [])

    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('author_id', user.id)
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
      else toast.success('Announcement published')
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Deleted'); fetchData() }
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
    if (!batchId) return 'All Students'
    return batches.find(b => b.id === batchId)?.name ?? 'Unknown'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage announcements for your students</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          New Announcement
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Create your first announcement to notify students."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.is_pinned && <Pin className="h-4 w-4 text-indigo-500 shrink-0" />}
                      <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                      <Badge variant={PRIORITY_VARIANT[a.priority] ?? 'secondary'}>
                        {a.priority}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{a.content}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                      <span>{getBatchName(a.batch_id)}</span>
                      <span>{new Date(a.published_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingId ? 'Edit Announcement' : 'New Announcement'}
        description={editingId ? 'Update the announcement details.' : 'Write an announcement for your students.'}
      >
        <div className="space-y-4">
          <Input
            label="Title *"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Exam Schedule Update"
          />
          <Textarea
            label="Content *"
            value={form.content}
            onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Write your announcement here..."
            rows={5}
          />
          <Select
            label="Target Batch"
            value={form.batch_id}
            onChange={(e) => setForm(f => ({ ...f, batch_id: e.target.value }))}
          >
            <option value="">All Students</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
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
              onChange={(e) => setForm(f => ({ ...f, is_pinned: e.target.checked }))}
              className="rounded border-gray-300"
            />
            Pin this announcement
          </label>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : editingId ? 'Update' : 'Publish Announcement'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
