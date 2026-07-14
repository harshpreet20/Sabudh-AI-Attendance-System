'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { ONBOARDING_VERSION } from '@/lib/onboarding'

interface StudentShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
  profileComplete: boolean
  onboardingVersion: number
  studentProfileId: string | null
}

const PROFILE_GATE_ALLOWED_PATHS = ['/dashboard/complete-profile', '/dashboard/profile']

export function StudentShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
  profileComplete,
  onboardingVersion,
  studentProfileId,
}: StudentShellWrapperProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isAllowedPath = PROFILE_GATE_ALLOWED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )

  useEffect(() => {
    if (!profileComplete && !isAllowedPath) {
      router.replace('/dashboard/complete-profile')
    }
  }, [profileComplete, isAllowedPath, router])

  // Show the tour to new users and to returning users whose completed tour is
  // older than the current tutorial version (so content updates re-trigger it).
  const showOnboarding =
    profileComplete && onboardingVersion < ONBOARDING_VERSION && studentProfileId

  return (
    <DashboardShell
      role="student"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
      {showOnboarding && (
        <OnboardingTour studentProfileId={studentProfileId} />
      )}
    </DashboardShell>
  )
}
