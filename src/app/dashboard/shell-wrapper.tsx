'use client'

import { usePathname } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'

interface StudentShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
}

export function StudentShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
}: StudentShellWrapperProps) {
  const pathname = usePathname()

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
