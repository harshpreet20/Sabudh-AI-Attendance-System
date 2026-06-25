'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Camera,
  CheckCircle,
  Clock,
  CalendarOff,
  Timer,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import type { Session, StudentProfile, Attendance } from '@/types/database'

type PageState =
  | 'loading'
  | 'no_profile'
  | 'no_session'
  | 'already_submitted'
  | 'window_open'
  | 'submitted_success'
  | 'error'

export default function AttendancePage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [existingAttendance, setExistingAttendance] = useState<Attendance | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setPageState('error')
        setErrorMessage('Not authenticated.')
        return
      }

      // Get student profile
      const { data: profileData } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (!profileData) {
        setPageState('no_profile')
        return
      }

      setProfile(profileData as StudentProfile)

      if (!profileData.batch_id) {
        setPageState('no_session')
        return
      }

      // Check for open session today
      const today = new Date().toISOString().split('T')[0]
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('batch_id', profileData.batch_id)
        .eq('session_date', today)
        .eq('status', 'attendance_open')
        .limit(1)

      if (!sessions || sessions.length === 0) {
        setPageState('no_session')
        return
      }

      const activeSession = sessions[0] as Session
      setSession(activeSession)

      // Check if already submitted
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', activeSession.id)
        .eq('student_id', profileData.id)
        .limit(1)

      if (attendance && attendance.length > 0) {
        setExistingAttendance(attendance[0] as Attendance)
        setPageState('already_submitted')
        return
      }

      setPageState('window_open')
    } catch {
      setPageState('error')
      setErrorMessage('Failed to load attendance data.')
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Countdown timer
  useEffect(() => {
    if (pageState !== 'window_open' || !session?.attendance_close) return

    const updateTimer = () => {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const endTime = new Date(`${today}T${session.attendance_close}`)
      const diff = endTime.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining('00:00')
        setPageState('no_session')
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeRemaining(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      )
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [pageState, session])

  async function handleMarkAttendance() {
    if (!session || !profile) return

    setSubmitting(true)
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('attendance')
        .insert({
          session_id: session.id,
          student_id: profile.id,
          status: 'draft',
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        toast.error('Failed to mark attendance. Please try again.')
        return
      }

      setExistingAttendance(data as Attendance)
      setPageState('submitted_success')
      toast.success('Attendance marked successfully!')
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton shape="rect" height={200} />
        <Skeleton shape="rect" height={300} />
      </div>
    )
  }

  // No profile
  if (pageState === 'no_profile') {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={AlertCircle}
          title="Profile not found"
          description="Your student profile has not been set up yet. Please contact your administrator."
        />
      </div>
    )
  }

  // Error
  if (pageState === 'error') {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={AlertCircle}
          title="Something went wrong"
          description={errorMessage || 'An error occurred while loading attendance data.'}
          action={
            <Button variant="outline" onClick={() => { setPageState('loading'); fetchData() }}>
              Try Again
            </Button>
          }
        />
      </div>
    )
  }

  // No session today
  if (pageState === 'no_session') {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          icon={CalendarOff}
          title="No active attendance window"
          description="There is no class with an open attendance window right now. Check back when your next session begins."
        />
      </div>
    )
  }

  // Already submitted
  if (pageState === 'already_submitted' && existingAttendance) {
    const statusConfig: Record<string, { variant: 'success' | 'warning' | 'default' | 'destructive'; label: string }> = {
      draft: { variant: 'default', label: 'Submitted' },
      uploaded: { variant: 'default', label: 'Uploaded' },
      processing: { variant: 'warning', label: 'Processing' },
      approved: { variant: 'success', label: 'Approved' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      manual_review: { variant: 'warning', label: 'Under Review' },
      excused: { variant: 'default', label: 'Excused' },
    }

    const config = statusConfig[existingAttendance.status] || statusConfig.draft

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 rounded-full bg-green-100 p-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Attendance Already Recorded
            </h2>
            <p className="mt-2 text-gray-500">
              Your attendance for today&apos;s session has been submitted.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            {existingAttendance.submitted_at && (
              <p className="mt-2 text-sm text-gray-400">
                Checked in at{' '}
                {new Date(existingAttendance.submitted_at).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Verification status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <VerificationStep
                label="Attendance Submitted"
                completed={true}
              />
              <VerificationStep
                label="Photo Verification"
                completed={
                  existingAttendance.status !== 'draft' &&
                  existingAttendance.status !== 'uploaded'
                }
                active={
                  existingAttendance.status === 'uploaded' ||
                  existingAttendance.status === 'processing'
                }
              />
              <VerificationStep
                label="AI Decision"
                completed={
                  existingAttendance.status === 'approved' ||
                  existingAttendance.status === 'rejected'
                }
                active={existingAttendance.status === 'processing'}
              />
              <VerificationStep
                label="Final Approval"
                completed={existingAttendance.status === 'approved'}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Submitted success (just submitted)
  if (pageState === 'submitted_success') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 animate-bounce rounded-full bg-green-100 p-4">
              <ShieldCheck className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Attendance Marked Successfully!
            </h2>
            <p className="mt-2 text-gray-500">
              Your attendance has been recorded. It will be verified shortly.
            </p>
            {existingAttendance?.submitted_at && (
              <p className="mt-2 text-sm text-gray-400">
                Checked in at{' '}
                {new Date(existingAttendance.submitted_at).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            <Badge variant="success" className="mt-4">
              <CheckCircle className="mr-1 h-3 w-3" />
              Submitted
            </Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Attendance window is open
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Session info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {session?.session_date ? 'Session ' + session.session_date : 'Today\'s Session'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {session?.session_date &&
                  new Date(session.session_date).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
              </p>
            </div>
            <Badge variant="success">
              <Clock className="mr-1 h-3 w-3" />
              Window Open
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Countdown timer */}
      {timeRemaining && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 p-4">
            <Timer className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">Time Remaining</p>
              <p className="text-2xl font-bold tabular-nums text-amber-900">
                {timeRemaining}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Random word display - placeholder for actual word from session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-center">Attendance Word</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-4xl font-bold tracking-wider text-blue-600">
            VERIFY
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Say this word during verification
          </p>
        </CardContent>
      </Card>

      {/* Camera preview area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Camera Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12">
            <Camera className="h-16 w-16 text-gray-300" />
            <p className="mt-4 text-sm font-medium text-gray-500">
              Camera preview
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Photo verification will be enabled in a future update
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Submit button */}
      <Button
        onClick={handleMarkAttendance}
        loading={submitting}
        size="lg"
        className="w-full"
      >
        <CheckCircle className="h-5 w-5" />
        Mark Attendance
      </Button>
    </div>
  )
}

function VerificationStep({
  label,
  completed,
  active = false,
}: {
  label: string
  completed: boolean
  active?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          completed
            ? 'bg-green-100'
            : active
              ? 'bg-blue-100'
              : 'bg-gray-100'
        }`}
      >
        {completed ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : active ? (
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
        ) : (
          <div className="h-3 w-3 rounded-full bg-gray-300" />
        )}
      </div>
      <span
        className={`text-sm ${
          completed
            ? 'font-medium text-green-700'
            : active
              ? 'font-medium text-blue-700'
              : 'text-gray-500'
        }`}
      >
        {label}
      </span>
    </div>
  )
}
