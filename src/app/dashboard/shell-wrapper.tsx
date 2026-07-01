'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'

interface StudentShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
  profileComplete: boolean
}

// Paths that must remain reachable even when the profile photo is missing,
// otherwise the user could never complete (or view) their profile.
const PROFILE_GATE_ALLOWED_PATHS = ['/dashboard/complete-profile', '/dashboard/profile']

export function StudentShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
  profileComplete,
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

  return (
    <DashboardShell
      role="student"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
    </DashboardShell>
  )
}
