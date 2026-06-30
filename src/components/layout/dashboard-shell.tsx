'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './sidebar'
import { Header } from './header'

interface DashboardShellProps {
  children: React.ReactNode
  role: 'student' | 'admin'
  currentPath: string
  userName?: string
  userEmail?: string
  avatarUrl?: string | null
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/attendance': 'Mark Attendance',
  '/dashboard/history': 'Attendance History',
  '/dashboard/certificate': 'Certificate',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
  '/admin': 'Admin Dashboard',
  '/admin/students': 'Students',
  '/admin/sessions': 'Sessions',
  '/admin/classrooms': 'Classrooms',
  '/admin/analytics': 'Analytics',
  '/admin/certificates': 'Certificates',
  '/admin/import': 'Import Students',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
}

export function DashboardShell({
  children,
  role,
  currentPath,
  userName = 'User',
  userEmail = '',
  avatarUrl,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)

  useEffect(() => {
    async function fetchNotificationCount() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)

      setNotificationCount(count ?? 0)
    }

    fetchNotificationCount()
  }, [])

  const pageTitle = pageTitles[currentPath] || 'Dashboard'

  return (
    <div className="min-h-screen spatial-bg-rich">
      <Sidebar
        role={role}
        currentPath={currentPath}
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="lg:pl-64">
        <Header
          title={pageTitle}
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          notificationCount={notificationCount}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
