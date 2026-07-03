'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { Footer } from './footer'
import { MobileNav } from './mobile-nav'
import { ChatWidget } from '@/components/chatbot/chat-widget'
import { useBadgeCounts } from '@/hooks/use-badge-counts'

interface DashboardShellProps {
  children: React.ReactNode
  role: 'student' | 'teacher' | 'admin'
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
  '/dashboard/leave': 'Leave Applications',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/schedules': 'Schedules',
  '/dashboard/assignments': 'Assignments',
  '/dashboard/discussions': 'Discussions',
  '/dashboard/messages': 'Messages',
  '/dashboard/projects': 'Projects',
  '/dashboard/journey': 'My Journey',
  '/dashboard/curriculum': 'Curriculum',
  '/teacher': 'Teacher Dashboard',
  '/teacher/students': 'Students',
  '/teacher/attendance': 'Attendance',
  '/teacher/schedules': 'Schedules',
  '/teacher/discussions': 'Discussions',
  '/teacher/messages': 'Messages',
  '/teacher/announcements': 'Announcements',
  '/teacher/leave': 'Leave Requests',
  '/teacher/assignments': 'Assignments',
  '/teacher/projects': 'Projects',
  '/teacher/progress': 'Progress Reviews',
  '/teacher/curriculum': 'Curriculum',
  '/teacher/profile': 'Profile',
  '/admin': 'Admin Dashboard',
  '/admin/approvals': 'Account Approvals',
  '/admin/students': 'Students',
  '/admin/sessions': 'Sessions',
  '/admin/classrooms': 'Classrooms',
  '/admin/campuses': 'Campuses',
  '/admin/courses': 'Courses & Batches',
  '/admin/analytics': 'Analytics',
  '/admin/certificates': 'Certificates',
  '/admin/users': 'Manage Users',
  '/admin/import': 'Import Students',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
  '/admin/knowledge-base': 'Knowledge Base',
  '/admin/discussions': 'Discussions',
  '/admin/messages': 'Messages',
  '/admin/announcements': 'Announcements',
  '/admin/leave': 'Leave Requests',
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
  const badgeCounts = useBadgeCounts()
  const notificationCount = badgeCounts.notifications ?? 0

  const pageTitle = pageTitles[currentPath]
    || (currentPath.startsWith('/teacher/projects/') ? 'Project Details' : null)
    || 'Dashboard'

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
        badgeCounts={badgeCounts}
      />

      <div className="lg:pl-64">
        <Header
          title={pageTitle}
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          notificationCount={notificationCount}
          messageCount={badgeCounts.messages ?? 0}
          role={role}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>
        <Footer className="hidden lg:block" />
      </div>

      <MobileNav role={role} currentPath={currentPath} />
      <ChatWidget />
    </div>
  )
}
