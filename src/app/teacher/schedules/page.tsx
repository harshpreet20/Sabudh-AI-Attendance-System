'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Calendar, Pencil, Trash2, Video, ExternalLink } from 'lucide-react'
import type { ClassSchedule, Batch } from '@/types/database'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const TYPE_LABELS: Record<string, string> = {
  class: 'Class',
  assessment: 'Assessment',
  topic: 'Topic',
  holiday: 'Holiday',
  event: 'Event',
}

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  class: 'default',
  assessment: 'destructive',
  topic: 'success',
  holiday: 'warning',
  event: 'secondary',
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  scheduled: 'secondary',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'destructive',
  postponed: 'warning',
}

export default function TeacherSchedulesPage() {
  const supabase = createClient()
  const [schedules, setSchedules] = useState<ClassSchedule[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterBatch, setFilterBatch] = useState('')

  const [form, setForm] = useState({
    batch_id: '',
    schedule_type: 'class' as string,
    title: '',
    description: '',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    location: '',
    meeting_url: '',
    meeting_provider: '',
  })

  const resetForm = () => {
    setForm({
      batch_id: '',
      schedule_type: 'class',
      title: '',
      description: '',
      scheduled_date: '',
      start_time: '',
      end_time: '',
      location: '',
      meeting_url: '',
      meeting_provider: '',
    })
    setEditingId(null)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'active')
      .order('name')

    setBatches((myBatches as Batch[]) ?? [])

    let query = supabase
      .from('class_schedules')
      .select('*')
      .eq('instructor_id', user.id)
      .order('scheduled_date', { ascending: true })

    if (filterType) query = query.eq('schedule_type', filterType)
    if (filterBatch) query = query.eq('batch_id', filterBatch)

    const { data } = await query
    setSchedules((data as ClassSchedule[]) ?? [])
    setLoading(false)
  }, [filterType, filterBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSave() {
    if (!form.batch_id || !form.title.trim() || !form.scheduled_date) {
      toast.error('Please fill in batch, title, and date')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      organization_id: ORG_ID,
      batch_id: form.batch_id,
      instructor_id: user.id,
      schedule_type: form.schedule_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      scheduled_date: form.scheduled_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || null,
      meeting_url: form.meeting_url.trim() || null,
      meeting_provider: form.meeting_provider || null,
    }

    if (editingId) {
      const { error } = await supabase.from('class_schedules').update(payload).eq('id', editingId)
      if (error) {
        toast.error('Failed to update schedule')
      } else {
        toast.success('Schedule updated')
      }
    } else {
      const { error } = await supabase.from('class_schedules').insert(payload)
      if (error) {
        toast.error('Failed to create schedule')
      } else {
        toast.success('Schedule created')
      }
    }

    setSaving(false)
    setShowDialog(false)
    resetForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('class_schedules').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete schedule')
    } else {
      toast.success('Schedule deleted')
      fetchData()
    }
  }

  function handleEdit(schedule: ClassSchedule) {
    setForm({
      batch_id: schedule.batch_id,
      schedule_type: schedule.schedule_type,
      title: schedule.title,
      description: schedule.description ?? '',
      scheduled_date: schedule.scheduled_date,
      start_time: schedule.start_time ?? '',
      end_time: schedule.end_time ?? '',
      location: schedule.location ?? '',
      meeting_url: schedule.meeting_url ?? '',
      meeting_provider: schedule.meeting_provider ?? '',
    })
    setEditingId(schedule.id)
    setShowDialog(true)
  }

  function getBatchName(batchId: string) {
    return batches.find(b => b.id === batchId)?.name ?? 'Unknown'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage class schedules, assessments, and topics</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Schedule
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No schedules yet"
          description="Create your first schedule to get started."
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{schedule.title}</p>
                    <Badge variant={TYPE_BADGE_VARIANT[schedule.schedule_type] ?? 'secondary'}>
                      {TYPE_LABELS[schedule.schedule_type] ?? schedule.schedule_type}
                    </Badge>
                    <Badge variant={STATUS_BADGE_VARIANT[schedule.status] ?? 'secondary'}>
                      {schedule.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                    <span>{new Date(schedule.scheduled_date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    {schedule.start_time && <span>{schedule.start_time}{schedule.end_time ? `  - ${schedule.end_time}` : ''}</span>}
                    <span>{getBatchName(schedule.batch_id)}</span>
                    {schedule.location && <span>{schedule.location}</span>}
                    {schedule.meeting_url && (
                      <a href={schedule.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500">
                        <Video className="h-3.5 w-3.5" />
                        {schedule.meeting_provider === 'google_meet' ? 'Google Meet' : schedule.meeting_provider === 'zoom' ? 'Zoom' : schedule.meeting_provider === 'teams' ? 'Teams' : 'Join Meeting'}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {schedule.description && <p className="mt-1 text-sm text-gray-400 truncate">{schedule.description}</p>}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(schedule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editingId ? 'Edit Schedule' : 'Create Schedule'}
        description={editingId ? 'Update the schedule details below.' : 'Fill in the details to create a new schedule.'}
      >
        <div className="space-y-4">
          <Select
            label="Batch *"
            value={form.batch_id}
            onChange={(e) => setForm(f => ({ ...f, batch_id: e.target.value }))}
          >
            <option value="">Select batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Select
            label="Type *"
            value={form.schedule_type}
            onChange={(e) => setForm(f => ({ ...f, schedule_type: e.target.value }))}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Input
            label="Title *"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Introduction to Neural Networks"
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional details about this schedule"
            rows={3}
          />
          <Input
            label="Date *"
            type="date"
            value={form.scheduled_date}
            onChange={(e) => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Time"
              type="time"
              value={form.start_time}
              onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
            />
            <Input
              label="End Time"
              type="time"
              value={form.end_time}
              onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}
            />
          </div>
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="e.g., Room 101"
          />
          <Select
            label="Meeting Provider"
            value={form.meeting_provider}
            onChange={(e) => setForm(f => ({ ...f, meeting_provider: e.target.value }))}
          >
            <option value="">No online meeting</option>
            <option value="google_meet">Google Meet</option>
            <option value="zoom">Zoom</option>
            <option value="teams">Microsoft Teams</option>
          </Select>
          {form.meeting_provider && (
            <Input
              label="Meeting URL"
              value={form.meeting_url}
              onChange={(e) => setForm(f => ({ ...f, meeting_url: e.target.value }))}
              placeholder={form.meeting_provider === 'google_meet' ? 'https://meet.google.com/...' : form.meeting_provider === 'zoom' ? 'https://zoom.us/j/...' : 'https://teams.microsoft.com/...'}
            />
          )}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : editingId ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
