'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  UserPlus,
  CheckCircle2,
  Users,
  BookOpen,
  Hand,
  ClipboardCheck,
  MessageSquare,
  Award,
  Star,
  TrendingUp,
  FolderKanban,
  MapPin,
  ArrowLeft,
  Plus,
  Send,
} from 'lucide-react'
import Link from 'next/link'
import type { StudentJourneyEvent } from '@/types/database'

const EVENT_ICONS: Record<string, React.ElementType> = {
  registered: UserPlus,
  approved: CheckCircle2,
  batch_assigned: Users,
  first_attendance: Hand,
  profile_completed: Star,
  assignment_submitted: ClipboardCheck,
  project_submitted: FolderKanban,
  discussion_started: MessageSquare,
  milestone_25: TrendingUp,
  milestone_50: TrendingUp,
  milestone_75: TrendingUp,
  certificate_eligible: Award,
  status_change: MapPin,
  instructor_note: Star,
  suspended: MapPin,
  expelled: MapPin,
  archived: MapPin,
}

const EVENT_COLORS: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-600',
  approved: 'bg-emerald-100 text-emerald-600',
  batch_assigned: 'bg-violet-100 text-violet-600',
  first_attendance: 'bg-amber-100 text-amber-600',
  profile_completed: 'bg-indigo-100 text-indigo-600',
  assignment_submitted: 'bg-teal-100 text-teal-600',
  project_submitted: 'bg-pink-100 text-pink-600',
  discussion_started: 'bg-orange-100 text-orange-600',
  milestone_25: 'bg-cyan-100 text-cyan-600',
  milestone_50: 'bg-lime-100 text-lime-600',
  milestone_75: 'bg-emerald-100 text-emerald-600',
  certificate_eligible: 'bg-yellow-100 text-yellow-600',
  instructor_note: 'bg-indigo-100 text-indigo-600',
  suspended: 'bg-red-100 text-red-600',
  expelled: 'bg-red-100 text-red-600',
  archived: 'bg-gray-100 text-gray-600',
}

interface StudentInfo {
  id: string
  full_name: string
  email: string
  status: string
  attendance_percentage: number
  batch_name: string | null
  created_at: string
}

export default function StudentJourneyTeacherPage() {
  const searchParams = useSearchParams()
  const studentId = searchParams.get('id')
  const supabase = createClient()

  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [events, setEvents] = useState<StudentJourneyEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [addDialog, setAddDialog] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteDesc, setNoteDesc] = useState('')
  const [posting, setPosting] = useState(false)

  const fetchJourney = useCallback(async () => {
    if (!studentId) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, full_name, email, status, attendance_percentage, batch_id, created_at')
      .eq('id', studentId)
      .single()

    if (!profile) { setLoading(false); return }

    let batchName: string | null = null
    if (profile.batch_id) {
      const { data: batch } = await supabase
        .from('batches')
        .select('name')
        .eq('id', profile.batch_id)
        .single()
      batchName = batch?.name ?? null
    }

    setStudent({
      ...profile,
      batch_name: batchName,
    })

    const { data: journeyEvents } = await supabase
      .from('student_journey_events')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    setEvents(journeyEvents ?? [])
    setLoading(false)
  }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJourney() }, [fetchJourney])

  async function handleAddNote() {
    if (!noteTitle.trim() || !studentId) return
    setPosting(true)

    const { error } = await supabase.from('student_journey_events').insert({
      student_id: studentId,
      event_type: 'instructor_note',
      title: noteTitle.trim(),
      description: noteDesc.trim() || null,
    })

    if (error) {
      toast.error('Failed to add note')
    } else {
      toast.success('Note added to journey')
      setAddDialog(false)
      setNoteTitle('')
      setNoteDesc('')
      fetchJourney()
    }
    setPosting(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!studentId || !student) {
    return (
      <EmptyState
        icon={MapPin}
        title="Student not found"
        description="No student ID provided or student does not exist."
      />
    )
  }

  const statusColor = {
    pending: 'warning',
    active: 'success',
    suspended: 'destructive',
    expelled: 'destructive',
    archived: 'secondary',
  } as const

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/students">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{student.full_name}&apos;s Journey</h1>
          <p className="text-sm text-gray-500">{student.email}</p>
        </div>
        <Button size="sm" onClick={() => setAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Note
        </Button>
      </div>

      {/* Student Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <Badge variant={statusColor[student.status as keyof typeof statusColor] ?? 'secondary'} className="mt-1">
                {student.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500">Attendance</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{student.attendance_percentage}%</p>
            </div>
            {student.batch_name && (
              <div>
                <p className="text-xs text-gray-500">Batch</p>
                <p className="mt-1 text-sm font-medium text-gray-900">{student.batch_name}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Joined</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {new Date(student.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Journey Events</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{events.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            Journey Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No events yet"
              description="This student has no journey events recorded."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
              <div className="space-y-6">
                {events.map((event, index) => {
                  const Icon = EVENT_ICONS[event.event_type] ?? MapPin
                  const colorClass = EVENT_COLORS[event.event_type] ?? 'bg-gray-100 text-gray-600'

                  return (
                    <div key={event.id} className="relative flex gap-4 pl-0">
                      <div className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
                          {index === 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">Latest</Badge>
                          )}
                          {event.event_type === 'instructor_note' && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Note</Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="mt-0.5 text-sm text-gray-500">{event.description}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(event.created_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Note Dialog */}
      <Dialog
        open={addDialog}
        onClose={() => setAddDialog(false)}
        title="Add Journey Note"
        description={`Add a note to ${student.full_name}'s learning journey`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddNote} loading={posting} disabled={!noteTitle.trim()}>
              <Send className="mr-1 h-3.5 w-3.5" />
              Add Note
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g., Excellent Progress in Module 3"
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
          />
          <Textarea
            label="Description (optional)"
            placeholder="Additional details..."
            value={noteDesc}
            onChange={e => setNoteDesc(e.target.value)}
            rows={3}
          />
        </div>
      </Dialog>
    </div>
  )
}
