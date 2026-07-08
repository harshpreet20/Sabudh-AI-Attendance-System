'use client'

import { usePathname } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { AdminOnboardingTour } from '@/components/onboarding/admin-onboarding-tour'

interface AdminShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
}

export function AdminShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
}: AdminShellWrapperProps) {
  const pathname = usePathname()

  return (
    <DashboardShell
      role="admin"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
      <AdminOnboardingTour />
    </DashboardShell>
  )
}
