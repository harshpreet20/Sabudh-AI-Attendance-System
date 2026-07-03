'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generateFingerprint } from '@/lib/device-fingerprint'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  CheckCircle,
  Clock,
  CalendarOff,
  Timer,
  ShieldCheck,
  AlertCircle,
  MapPin,
  Navigation,
  Loader2,
  XCircle,
  KeyRound,
  Fingerprint,
  ShieldAlert,
  BookOpen,
} from 'lucide-react'
import type { Session, StudentProfile, Attendance } from '@/types/database'

type PageState =
  | 'loading'
  | 'no_profile'
  | 'no_session'
  | 'already_submitted'
  | 'window_open'
  | 'submitted_success'
  | 'submitted_review'
  | 'error'

export default function AttendancePage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [session, setSession] = useState<(Session & { attendance_word?: string | null; topic_taught?: string | null; next_topic?: string | null; topic_teacher_name?: string | null }) | null>(null)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [existingAttendance, setExistingAttendance] = useState<Attendance | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [verificationWord, setVerificationWord] = useState('')
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [hasAttendanceWord, setHasAttendanceWord] = useState(false)

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

      const activeSession = sessions[0] as Session & { attendance_word?: string | null; topic_taught?: string | null; next_topic?: string | null; topic_teacher_name?: string | null }
      setSession(activeSession)
      setHasAttendanceWord(!!activeSession.attendance_word)

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

  useEffect(() => {
    if (pageState !== 'window_open') return
    requestLocation()
    generateFingerprint().then(setFingerprint).catch(() => {})
  }, [pageState])

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationError('Geolocation is not supported by your browser.')
      return
    }

    setLocationStatus('requesting')
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationStatus('granted')
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus('denied')
          setLocationError('Location access denied. Please enable location permissions to mark attendance.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationStatus('error')
          setLocationError('Unable to determine your location. Please try again.')
        } else {
          setLocationStatus('error')
          setLocationError('Location request timed out. Please try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

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

    if (!coords) {
      toast.error('Location is required to mark attendance. Please enable location access.')
      return
    }

    if (hasAttendanceWord && !verificationWord.trim()) {
      toast.error('Please enter the verification word provided by your instructor.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          latitude: coords.lat,
          longitude: coords.lng,
          location_accuracy: coords.accuracy,
          attendance_word: verificationWord.trim() || null,
          device_fingerprint: fingerprint,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.error?.message || 'Failed to mark attendance.'
        toast.error(errorMsg)
        return
      }

      setExistingAttendance({
        id: data.data.attendance_id,
        status: data.data.status,
        decision: data.data.decision,
        submitted_at: data.data.submitted_at,
        session_id: session.id,
        student_id: profile.id,
      } as Attendance)

      if (data.data.flagged) {
        setPageState('submitted_review')
        toast.warning('Attendance submitted but flagged for review.')
      } else {
        setPageState('submitted_success')
        toast.success('Attendance marked successfully!')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton shape="rect" height={200} />
        <Skeleton shape="rect" height={300} />
      </div>
    )
  }

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
            <div className="mb-4 rounded-full bg-emerald-100/70 p-4 backdrop-blur-sm">
              <CheckCircle className="h-12 w-12 text-emerald-600" />
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <VerificationStep label="Attendance Submitted" completed={true} />
              <VerificationStep
                label="Location Verified"
                completed={existingAttendance.status === 'approved'}
                active={existingAttendance.status === 'manual_review'}
              />
              <VerificationStep
                label="Device Verified"
                completed={existingAttendance.status === 'approved'}
                active={existingAttendance.status === 'manual_review'}
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

  if (pageState === 'submitted_review') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 rounded-full bg-amber-100/70 p-4 backdrop-blur-sm">
              <ShieldAlert className="h-12 w-12 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Attendance Under Review
            </h2>
            <p className="mt-2 text-gray-500">
              Your attendance has been submitted but flagged for manual review. Your teacher will verify it shortly.
            </p>
            <Badge variant="warning" className="mt-4">
              <Clock className="mr-1 h-3 w-3" />
              Pending Review
            </Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (pageState === 'submitted_success') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 animate-bounce rounded-full bg-emerald-100/70 p-4 backdrop-blur-sm">
              <ShieldCheck className="h-12 w-12 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Attendance Marked Successfully!
            </h2>
            <p className="mt-2 text-gray-500">
              Your attendance has been recorded and verified.
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
              Verified
            </Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canSubmit = locationStatus === 'granted' && coords !== null && (!hasAttendanceWord || verificationWord.trim().length > 0)

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

      {/* Topic info */}
      {session && (session.topic_taught || session.next_topic || session.topic_teacher_name) && (
        <Card className="!bg-indigo-50/60 !border-indigo-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <p className="text-sm font-medium text-indigo-800">Session Topics</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {session.topic_taught && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Today&apos;s Topic</p>
                  <p className="mt-0.5 text-sm text-gray-900">{session.topic_taught}</p>
                </div>
              )}
              {session.next_topic && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Next Class</p>
                  <p className="mt-0.5 text-sm text-gray-900">{session.next_topic}</p>
                </div>
              )}
              {session.topic_teacher_name && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Instructor</p>
                  <p className="mt-0.5 text-sm text-gray-900">{session.topic_teacher_name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Countdown timer */}
      {timeRemaining && (
        <Card className="!bg-amber-50/60 !border-amber-200/50">
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

      {/* Location verification card */}
      <Card className={
        locationStatus === 'granted'
          ? '!bg-emerald-50/60 !border-emerald-200/50'
          : locationStatus === 'denied' || locationStatus === 'error'
            ? '!bg-red-50/60 !border-red-200/50'
            : '!bg-indigo-50/60 !border-indigo-200/50'
      }>
        <CardContent className="flex items-center gap-3 p-4">
          {locationStatus === 'idle' || locationStatus === 'requesting' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-indigo-800">Requesting Location...</p>
                <p className="text-xs text-indigo-600">
                  Please allow location access to mark attendance
                </p>
              </div>
            </>
          ) : locationStatus === 'granted' ? (
            <>
              <MapPin className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800">Location Verified</p>
                <p className="text-xs text-emerald-600">
                  Accuracy: {coords ? `${Math.round(coords.accuracy)}m` : 'N/A'}
                </p>
              </div>
              <Navigation className="h-4 w-4 text-emerald-500" />
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  {locationStatus === 'denied' ? 'Location Access Denied' : 'Location Error'}
                </p>
                <p className="text-xs text-red-600">{locationError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={requestLocation}
                className="shrink-0"
              >
                Retry
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Device fingerprint status */}
      <Card className={fingerprint ? '!bg-emerald-50/60 !border-emerald-200/50' : '!bg-gray-50/60 !border-gray-200/50'}>
        <CardContent className="flex items-center gap-3 p-4">
          <Fingerprint className={`h-5 w-5 ${fingerprint ? 'text-emerald-600' : 'text-gray-400'}`} />
          <div>
            <p className={`text-sm font-medium ${fingerprint ? 'text-emerald-800' : 'text-gray-600'}`}>
              {fingerprint ? 'Device Identified' : 'Generating device fingerprint...'}
            </p>
            <p className="text-xs text-gray-500">
              Unique device verification for security
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Verification word input */}
      {hasAttendanceWord && (
        <Card className="!bg-violet-50/60 !border-violet-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="h-5 w-5 text-violet-600" />
              <p className="text-sm font-medium text-violet-800">Verification Word Required</p>
            </div>
            <p className="text-xs text-violet-600 mb-3">
              Enter the word displayed by your instructor to confirm you are physically present.
            </p>
            <Input
              placeholder="Enter verification word..."
              value={verificationWord}
              onChange={(e) => setVerificationWord(e.target.value)}
              className="uppercase tracking-widest font-mono"
            />
          </CardContent>
        </Card>
      )}

      {/* Submit button */}
      <Button
        onClick={handleMarkAttendance}
        loading={submitting}
        disabled={!canSubmit}
        size="lg"
        className="w-full"
      >
        <CheckCircle className="h-5 w-5" />
        {!coords
          ? 'Enable Location to Continue'
          : hasAttendanceWord && !verificationWord.trim()
            ? 'Enter Verification Word'
            : 'Mark Attendance'}
      </Button>

      {!canSubmit && locationStatus !== 'requesting' && locationStatus !== 'idle' && (
        <p className="text-center text-xs text-gray-500">
          You must be within 500m of the class location and provide the verification word to mark attendance.
        </p>
      )}
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
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full backdrop-blur-sm ${
          completed
            ? 'bg-emerald-100/70'
            : active
              ? 'bg-indigo-100/70'
              : 'bg-white/40'
        }`}
      >
        {completed ? (
          <CheckCircle className="h-5 w-5 text-emerald-600" />
        ) : active ? (
          <div className="h-3 w-3 animate-pulse rounded-full bg-indigo-500" />
        ) : (
          <div className="h-3 w-3 rounded-full bg-gray-300" />
        )}
      </div>
      <span
        className={`text-sm ${
          completed
            ? 'font-medium text-emerald-700'
            : active
              ? 'font-medium text-indigo-700'
              : 'text-gray-500'
        }`}
      >
        {label}
      </span>
    </div>
  )
}
