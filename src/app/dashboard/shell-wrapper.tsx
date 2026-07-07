'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { LoginPermissionCheck } from '@/components/pwa/login-permission-check'

interface StudentShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
  profileComplete: boolean
  onboardingCompleted: boolean
  studentProfileId: string | null
}

const PROFILE_GATE_ALLOWED_PATHS = ['/dashboard/complete-profile', '/dashboard/profile']

export function StudentShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
  profileComplete,
  onboardingCompleted,
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

  const showOnboarding = profileComplete && !onboardingCompleted && studentProfileId

  return (
    <DashboardShell
      role="student"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
      suppressWelcome={!!showOnboarding}
    >
      {children}
      {showOnboarding && (
        <OnboardingTour studentProfileId={studentProfileId} />
      )}
      <LoginPermissionCheck disabled={!!showOnboarding} />
    </DashboardShell>
  )
}
