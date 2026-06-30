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
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [locationError, setLocationError] = useState('')

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

      const activeSession = sessions[0] as Session
      setSession(activeSession)

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

    if (!coords) {
      toast.error('Location is required to mark attendance. Please enable location access.')
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
      setPageState('submitted_success')
      toast.success('Attendance marked successfully!')
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
                active={existingAttendance.status === 'draft'}
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
              Your attendance has been recorded and location verified.
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

  // Attendance window is open
  const canSubmit = locationStatus === 'granted' && coords !== null

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

      {/* Location verification card */}
      <Card className={
        locationStatus === 'granted'
          ? 'border-green-200 bg-green-50'
          : locationStatus === 'denied' || locationStatus === 'error'
            ? 'border-red-200 bg-red-50'
            : 'border-blue-200 bg-blue-50'
      }>
        <CardContent className="flex items-center gap-3 p-4">
          {locationStatus === 'idle' || locationStatus === 'requesting' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Requesting Location...</p>
                <p className="text-xs text-blue-600">
                  Please allow location access to mark attendance
                </p>
              </div>
            </>
          ) : locationStatus === 'granted' ? (
            <>
              <MapPin className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Location Verified</p>
                <p className="text-xs text-green-600">
                  Accuracy: {coords ? `${Math.round(coords.accuracy)}m` : 'N/A'}
                </p>
              </div>
              <Navigation className="h-4 w-4 text-green-500" />
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

      {/* Submit button */}
      <Button
        onClick={handleMarkAttendance}
        loading={submitting}
        disabled={!canSubmit}
        size="lg"
        className="w-full"
      >
        <CheckCircle className="h-5 w-5" />
        {canSubmit ? 'Mark Attendance' : 'Enable Location to Continue'}
      </Button>

      {!canSubmit && locationStatus !== 'requesting' && locationStatus !== 'idle' && (
        <p className="text-center text-xs text-gray-500">
          You must be within 500m of the class location to mark attendance.
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
