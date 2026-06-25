import { requireAuth, getUserProfile } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
  Award,
  Download,
  CheckCircle,
  Target,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { Certificate } from '@/types/database'

export default async function CertificatePage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const profile = await getUserProfile(user.id)

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <EmptyState
          icon={AlertCircle}
          title="Profile not found"
          description="Your student profile has not been set up yet. Please contact your administrator."
        />
      </div>
    )
  }

  const attendancePercentage = profile.attendance_percentage ?? 0
  const totalClasses = profile.total_sessions ?? 0
  const classesAttended = profile.present_count ?? 0
  const requiredPercentage = 75
  const isEligible = attendancePercentage >= requiredPercentage

  // Calculate how many more classes needed
  let classesNeeded = 0
  if (!isEligible && totalClasses > 0) {
    // Classes needed to reach requiredPercentage, assuming future classes are attended
    // (attended + X) / (total + X) >= required/100
    // Solve for X: X >= (required * total - 100 * attended) / (100 - required)
    const numerator = requiredPercentage * totalClasses - 100 * classesAttended
    const denominator = 100 - requiredPercentage
    classesNeeded = denominator > 0 ? Math.max(0, Math.ceil(numerator / denominator)) : 0
  }

  // Fetch certificate if eligible
  let certificate: Certificate | null = null
  if (isEligible) {
    const { data } = await supabase
      .from('certificates')
      .select('*')
      .eq('student_id', profile.id)
      .eq('status', 'active')
      .order('issued_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      certificate = data[0] as Certificate
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Certificate Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Large progress display */}
          <div className="text-center">
            <div className="relative mx-auto mb-4 flex h-40 w-40 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke={
                    isEligible
                      ? '#16a34a'
                      : attendancePercentage >= 60
                        ? '#f59e0b'
                        : '#dc2626'
                  }
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(attendancePercentage / 100) * 326.73} 326.73`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">
                  {attendancePercentage.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500">Attendance</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">Progress toward certificate</span>
              <span className="font-medium text-gray-900">
                {Math.min(100, (attendancePercentage / requiredPercentage) * 100).toFixed(0)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, (attendancePercentage / requiredPercentage) * 100)}
              variant={isEligible ? 'success' : attendancePercentage >= 60 ? 'warning' : 'danger'}
              size="lg"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>0%</span>
              <span className="font-medium">Required: {requiredPercentage}%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{classesAttended}</p>
              <p className="text-xs text-gray-500">Classes Attended</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{totalClasses}</p>
              <p className="text-xs text-gray-500">Total Classes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {totalClasses - classesAttended}
              </p>
              <p className="text-xs text-gray-500">Classes Missed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Eligibility Status */}
      {isEligible ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-900">
                  You are eligible for a certificate!
                </h3>
                <p className="mt-1 text-sm text-green-700">
                  Congratulations! You have met the minimum attendance requirement of{' '}
                  {requiredPercentage}%.
                </p>

                {certificate ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg bg-white p-4">
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Certificate No.</span>
                          <span className="font-mono font-medium text-gray-900">
                            {certificate.verification_token}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Issued Date</span>
                          <span className="text-gray-900">
                            {new Date(certificate.issued_at).toLocaleDateString('en-IN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Attendance</span>
                          <span className="text-gray-900">
                            {certificate.attendance_percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Status</span>
                          <Badge variant={certificate.status === 'active' ? 'success' : 'destructive'}>
                            {certificate.status === 'active' ? 'Valid' : 'Revoked'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {certificate.qr_code_url && (
                      <a
                        href={certificate.qr_code_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        Download Certificate
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-green-600">
                    Your certificate is being generated. Please check back later.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-amber-100 p-3">
                <Target className="h-8 w-8 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-900">
                  Not Yet Eligible
                </h3>
                <p className="mt-1 text-sm text-amber-700">
                  You need{' '}
                  <span className="font-semibold">
                    {(requiredPercentage - attendancePercentage).toFixed(1)}%
                  </span>{' '}
                  more attendance to become eligible for a certificate.
                </p>
                {classesNeeded > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                    <p className="text-sm text-amber-800">
                      Attend the next{' '}
                      <span className="font-bold">{classesNeeded}</span>{' '}
                      consecutive {classesNeeded === 1 ? 'class' : 'classes'} to reach the required
                      attendance.
                    </p>
                  </div>
                )}
                <Link
                  href="/dashboard/attendance"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700 transition-colors"
                >
                  Mark Attendance
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
