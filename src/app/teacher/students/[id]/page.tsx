'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  FolderKanban,
  MapPin,
  MessageSquare,
  TrendingUp,
  XCircle,
  AlertCircle,
  Award,
  CalendarOff,
} from 'lucide-react'

interface StudentData {
  id: string
  full_name: string
  email: string
  phone: string | null
  profile_image_url: string | null
  status: string
  attendance_percentage: number
  present_count: number
  absent_count: number
  late_count: number
  total_sessions: number
  city: string | null
  profession: string | null
  qualification: string | null
  organization_name: string | null
  learning_goal: string | null
  created_at: string
  batch_id: string | null
}

interface AttendanceRecord {
  id: string
  status: string
  decision: string | null
  submitted_at: string | null
  is_grace: boolean | null
  sessions: {
    session_date: string
    status: string
  }
}

interface AssignmentScore {
  id: string
  score: number | null
  grace_marks: number | null
  status: string
  submitted_at: string
  graded_at: string | null
  feedback: string | null
  assignments: {
    title: string
    max_score: number
    due_date: string
  }
}

interface ProjectScore {
  id: string
  title: string | null
  score: number | null
  grace_marks: number | null
  ai_score: number | null
  status: string
  submitted_at: string
  graded_at: string | null
  feedback: string | null
  projects: {
    title: string
    max_score: number
    expertise: string
  }
}

interface LeaveRecord {
  id: string
  leave_date: string
  reason: string
  status: string
  reviewed_at: string | null
}

interface DiscussionActivity {
  threads: number
  replies: number
}

export default function StudentPerformancePage() {
  const params = useParams<{ id: string }>()
  const studentId = params.id
  const supabase = useMemo(() => createClient(), [])

  const [student, setStudent] = useState<StudentData | null>(null)
  const [batchName, setBatchName] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [assignments, setAssignments] = useState<AssignmentScore[]>([])
  const [projects, setProjects] = useState<ProjectScore[]>([])
  const [leaves, setLeaves] = useState<LeaveRecord[]>([])
  const [discussions, setDiscussions] = useState<DiscussionActivity>({ threads: 0, replies: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'attendance' | 'assignments' | 'projects' | 'leaves'>('overview')

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, full_name, email, phone, profile_image_url, status, attendance_percentage, present_count, absent_count, late_count, total_sessions, city, profession, qualification, organization_name, learning_goal, created_at, batch_id')
      .eq('id', studentId)
      .single()

    if (!profile) {
      setLoading(false)
      return
    }

    setStudent(profile as StudentData)

    if (profile.batch_id) {
      const { data: batch } = await supabase
        .from('batches')
        .select('name')
        .eq('id', profile.batch_id)
        .single()
      setBatchName(batch?.name ?? null)
    }

    const [attRes, assignRes, projRes, leaveRes, threadRes, replyRes] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, status, decision, submitted_at, is_grace, sessions!inner(session_date, status)')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })
        .limit(50),
      supabase
        .from('assignment_submissions')
        .select('id, score, grace_marks, status, submitted_at, graded_at, feedback, assignments!inner(title, max_score, due_date)')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('project_submissions')
        .select('id, title, score, grace_marks, ai_score, status, submitted_at, graded_at, feedback, projects!inner(title, max_score, expertise)')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('leave_requests')
        .select('id, leave_date, reason, status, reviewed_at')
        .eq('student_id', studentId)
        .order('leave_date', { ascending: false })
        .limit(20),
      supabase
        .from('discussion_threads')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', studentId),
      supabase
        .from('discussion_replies')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', studentId),
    ])

    setAttendance((attRes.data as unknown as AttendanceRecord[]) ?? [])
    setAssignments((assignRes.data as unknown as AssignmentScore[]) ?? [])
    setProjects((projRes.data as unknown as ProjectScore[]) ?? [])
    setLeaves((leaveRes.data as unknown as LeaveRecord[]) ?? [])
    setDiscussions({
      threads: threadRes.count ?? 0,
      replies: replyRes.count ?? 0,
    })

    setLoading(false)
  }, [studentId, supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!student) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Student not found"
        description="This student profile does not exist."
      />
    )
  }

  const initials = student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const totalAssignmentScore = assignments.reduce((sum, a) => sum + (a.score ?? 0) + (a.grace_marks ?? 0), 0)
  const totalAssignmentMax = assignments.reduce((sum, a) => sum + (a.assignments?.max_score ?? 0), 0)
  const assignmentPct = totalAssignmentMax > 0 ? (totalAssignmentScore / totalAssignmentMax) * 100 : 0

  const totalProjectScore = projects.reduce((sum, p) => sum + (p.score ?? 0) + (p.grace_marks ?? 0), 0)
  const totalProjectMax = projects.reduce((sum, p) => sum + (p.projects?.max_score ?? 0), 0)
  const projectPct = totalProjectMax > 0 ? (totalProjectScore / totalProjectMax) * 100 : 0

  const combinedPct = (totalAssignmentMax + totalProjectMax) > 0
    ? ((totalAssignmentScore + totalProjectScore) / (totalAssignmentMax + totalProjectMax)) * 100
    : 0

  const approvedLeaves = leaves.filter(l => l.status === 'approved').length
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/teacher/students">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{student.full_name}</h1>
          <p className="text-sm text-gray-500">{student.email}</p>
        </div>
        <Link href={`/teacher/students/journey?id=${studentId}`}>
          <Button variant="outline" size="sm">
            <MapPin className="mr-1 h-4 w-4" />
            Journey
          </Button>
        </Link>
      </div>

      {/* Profile + Stats Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar
              src={student.profile_image_url}
              fallback={initials}
              size="lg"
              className="h-20 w-20 text-xl flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant={student.status === 'active' ? 'success' : student.status === 'suspended' ? 'destructive' : 'warning'}>
                  {student.status}
                </Badge>
                {batchName && <Badge variant="outline">{batchName}</Badge>}
                {student.qualification && <Badge variant="secondary">{student.qualification}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <StatBlock label="Attendance" value={`${student.attendance_percentage.toFixed(1)}%`} color={student.attendance_percentage >= 75 ? 'text-green-700' : student.attendance_percentage >= 50 ? 'text-amber-700' : 'text-red-700'} />
                <StatBlock label="Present" value={String(student.present_count)} color="text-green-700" />
                <StatBlock label="Absent" value={String(student.absent_count)} color="text-red-700" />
                <StatBlock label="Assignments" value={`${assignmentPct.toFixed(0)}%`} color={assignmentPct >= 60 ? 'text-green-700' : 'text-amber-700'} />
                <StatBlock label="Projects" value={`${projectPct.toFixed(0)}%`} color={projectPct >= 60 ? 'text-green-700' : 'text-amber-700'} />
                <StatBlock label="Forum Posts" value={String(discussions.threads + discussions.replies)} color="text-indigo-700" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Progress */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-lg bg-blue-50 p-2"><BarChart3 className="h-4 w-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Attendance</p>
                <p className="text-lg font-bold">{student.attendance_percentage.toFixed(1)}%</p>
              </div>
            </div>
            <Progress
              value={Math.min(100, (student.attendance_percentage / 80) * 100)}
              variant={student.attendance_percentage >= 80 ? 'success' : student.attendance_percentage >= 60 ? 'warning' : 'danger'}
              size="sm"
            />
            <p className="mt-1 text-xs text-gray-400">{student.present_count}/{student.total_sessions} sessions &bull; 80% required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-lg bg-violet-50 p-2"><Award className="h-4 w-4 text-violet-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Combined Marks</p>
                <p className="text-lg font-bold">{combinedPct.toFixed(1)}%</p>
              </div>
            </div>
            <Progress
              value={Math.min(100, (combinedPct / 60) * 100)}
              variant={combinedPct >= 60 ? 'success' : combinedPct >= 40 ? 'warning' : 'danger'}
              size="sm"
            />
            <p className="mt-1 text-xs text-gray-400">{totalAssignmentScore + totalProjectScore}/{totalAssignmentMax + totalProjectMax} marks &bull; 60% required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-lg bg-emerald-50 p-2"><TrendingUp className="h-4 w-4 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Certificate Eligibility</p>
                <p className="text-lg font-bold">{student.attendance_percentage >= 80 && combinedPct >= 60 ? 'Eligible' : 'Not Yet'}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <Badge variant={student.attendance_percentage >= 80 ? 'success' : 'destructive'} className="text-[10px]">
                {student.attendance_percentage >= 80 ? 'Attendance OK' : 'Attendance Low'}
              </Badge>
              <Badge variant={combinedPct >= 60 ? 'success' : 'destructive'} className="text-[10px]">
                {combinedPct >= 60 ? 'Marks OK' : 'Marks Low'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {([
          ['overview', 'Overview', BookOpen],
          ['attendance', 'Attendance', Calendar],
          ['assignments', 'Assignments', ClipboardCheck],
          ['projects', 'Projects', FolderKanban],
          ['leaves', 'Leaves', CalendarOff],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              tab === key
                ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
                {([
                  ['Phone', student.phone],
                  ['City', student.city],
                  ['Profession', student.profession],
                  ['Organization', student.organization_name],
                  ['Joined', new Date(student.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })],
                ] as const).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-medium text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {student.learning_goal && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Learning Goal</p>
                  <p className="text-sm text-gray-700">{student.learning_goal}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Summary */}
          <Card>
            <CardHeader><CardTitle className="text-base">Activity Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-blue-50/60 p-4 text-center">
                  <ClipboardCheck className="mx-auto mb-1 h-5 w-5 text-blue-600" />
                  <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
                  <p className="text-xs text-gray-500">Assignments</p>
                </div>
                <div className="rounded-xl bg-violet-50/60 p-4 text-center">
                  <FolderKanban className="mx-auto mb-1 h-5 w-5 text-violet-600" />
                  <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
                  <p className="text-xs text-gray-500">Projects</p>
                </div>
                <div className="rounded-xl bg-indigo-50/60 p-4 text-center">
                  <MessageSquare className="mx-auto mb-1 h-5 w-5 text-indigo-600" />
                  <p className="text-2xl font-bold text-gray-900">{discussions.threads}</p>
                  <p className="text-xs text-gray-500">Threads</p>
                </div>
                <div className="rounded-xl bg-amber-50/60 p-4 text-center">
                  <CalendarOff className="mx-auto mb-1 h-5 w-5 text-amber-600" />
                  <p className="text-2xl font-bold text-gray-900">{approvedLeaves}</p>
                  <p className="text-xs text-gray-500">Leaves Taken</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Assignments */}
          {assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Recent Assignments</span>
                  <button onClick={() => setTab('assignments')} className="text-xs text-indigo-600 font-normal hover:underline">View all</button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {assignments.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50/60 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.assignments.title}</p>
                        <p className="text-xs text-gray-500">{new Date(a.submitted_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.score !== null ? (
                          <span className="text-sm font-semibold text-gray-900">{a.score + (a.grace_marks ?? 0)}/{a.assignments.max_score}</span>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">Pending</Badge>
                        )}
                        <Badge variant={a.status === 'graded' ? 'success' : a.status === 'returned' ? 'secondary' : 'warning'} className="text-[10px]">
                          {a.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Attendance History (Last 50)</CardTitle></CardHeader>
          <CardContent>
            {attendance.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No attendance records found</p>
            ) : (
              <div className="space-y-1.5">
                {attendance.map(a => {
                  const accepted = a.decision === 'accepted'
                  const rejected = a.decision === 'rejected'
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {accepted ? <CheckCircle className="h-4 w-4 text-green-500" /> : rejected ? <XCircle className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
                        <span className="text-sm text-gray-900">
                          {new Date(a.sessions.session_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.is_grace && <Badge variant="secondary" className="text-[10px]">Grace</Badge>}
                        <Badge variant={accepted ? 'success' : rejected ? 'destructive' : 'warning'} className="text-[10px]">
                          {a.decision ?? a.status}
                        </Badge>
                        {a.submitted_at && (
                          <span className="text-xs text-gray-400">
                            {new Date(a.submitted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'assignments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Assignment Submissions ({assignments.length})
              {totalAssignmentMax > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {totalAssignmentScore}/{totalAssignmentMax} ({assignmentPct.toFixed(1)}%)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No assignments submitted</p>
            ) : (
              <div className="space-y-3">
                {assignments.map(a => (
                  <div key={a.id} className="rounded-xl border border-gray-100 bg-white/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{a.assignments.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Submitted {new Date(a.submitted_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {a.graded_at && ` • Graded ${new Date(a.graded_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {a.score !== null ? (
                          <>
                            <p className="text-lg font-bold text-gray-900">{a.score + (a.grace_marks ?? 0)}<span className="text-sm font-normal text-gray-500">/{a.assignments.max_score}</span></p>
                            {(a.grace_marks ?? 0) > 0 && <p className="text-[10px] text-amber-600">+{a.grace_marks} grace</p>}
                          </>
                        ) : (
                          <Badge variant="warning">Ungraded</Badge>
                        )}
                      </div>
                    </div>
                    {a.feedback && (
                      <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">Feedback: </span>{a.feedback}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'projects' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Project Submissions ({projects.length})
              {totalProjectMax > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {totalProjectScore}/{totalProjectMax} ({projectPct.toFixed(1)}%)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No projects submitted</p>
            ) : (
              <div className="space-y-3">
                {projects.map(p => (
                  <div key={p.id} className="rounded-xl border border-gray-100 bg-white/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{p.projects.title}</p>
                        {p.title && <p className="text-sm text-gray-600 mt-0.5">{p.title}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px]">{p.projects.expertise}</Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(p.submitted_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {p.score !== null ? (
                          <>
                            <p className="text-lg font-bold text-gray-900">{p.score + (p.grace_marks ?? 0)}<span className="text-sm font-normal text-gray-500">/{p.projects.max_score}</span></p>
                            {p.ai_score !== null && <p className="text-[10px] text-indigo-600">AI: {p.ai_score}</p>}
                            {(p.grace_marks ?? 0) > 0 && <p className="text-[10px] text-amber-600">+{p.grace_marks} grace</p>}
                          </>
                        ) : (
                          <Badge variant="warning">Ungraded</Badge>
                        )}
                      </div>
                    </div>
                    {p.feedback && (
                      <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">Feedback: </span>{p.feedback}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'leaves' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Leave Requests ({leaves.length})
              <span className="ml-2 text-sm font-normal text-gray-500">
                {approvedLeaves} approved{pendingLeaves > 0 ? `, ${pendingLeaves} pending` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaves.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No leave requests</p>
            ) : (
              <div className="space-y-2">
                {leaves.map(l => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg bg-gray-50/60 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(l.leave_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.reason}</p>
                    </div>
                    <Badge variant={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'destructive' : 'warning'}>
                      {l.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/50 p-3 text-center backdrop-blur-sm">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  )
}
