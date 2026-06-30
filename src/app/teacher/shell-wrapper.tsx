'use client'

import { usePathname } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'

interface TeacherShellWrapperProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  avatarUrl: string | null
}

export function TeacherShellWrapper({
  children,
  userName,
  userEmail,
  avatarUrl,
}: TeacherShellWrapperProps) {
  const pathname = usePathname()

  return (
    <DashboardShell
      role="teacher"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
    </DashboardShell>
  )
}
