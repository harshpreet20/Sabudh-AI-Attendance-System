'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckSquare,
  ClipboardList,
  FolderKanban,
  Bell,
  Users,
  TrendingUp,
  Calendar,
  GraduationCap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

const studentNavItems: NavItem[] = [
  { label: 'Home', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Attend', icon: CheckSquare, href: '/dashboard/attendance' },
  { label: 'Work', icon: ClipboardList, href: '/dashboard/assignments' },
  { label: 'Projects', icon: FolderKanban, href: '/dashboard/projects' },
  { label: 'Alerts', icon: Bell, href: '/dashboard/notifications' },
]

const teacherNavItems: NavItem[] = [
  { label: 'Home', icon: LayoutDashboard, href: '/teacher' },
  { label: 'Students', icon: GraduationCap, href: '/teacher/students' },
  { label: 'Tasks', icon: ClipboardList, href: '/teacher/assignments' },
  { label: 'Projects', icon: FolderKanban, href: '/teacher/projects' },
  { label: 'Progress', icon: TrendingUp, href: '/teacher/progress' },
]

const adminNavItems: NavItem[] = [
  { label: 'Home', icon: LayoutDashboard, href: '/admin' },
  { label: 'Students', icon: Users, href: '/admin/students' },
  { label: 'Sessions', icon: Calendar, href: '/admin/sessions' },
  { label: 'Analytics', icon: TrendingUp, href: '/admin/analytics' },
  { label: 'Alerts', icon: Bell, href: '/admin/approvals' },
]

interface MobileNavProps {
  role: 'student' | 'teacher' | 'admin'
  currentPath: string
}

export function MobileNav({ role, currentPath }: MobileNavProps) {
  const navItems = role === 'admin' ? adminNavItems : role === 'teacher' ? teacherNavItems : studentNavItems

  function isActive(href: string) {
    if (href === '/dashboard' || href === '/admin' || href === '/teacher') {
      return currentPath === href
    }
    return currentPath.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass-strong border-t border-white/20 lg:hidden safe-area-bottom">
      <div className="flex items-stretch justify-around gap-0.5 px-1 pt-1.5">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[54px] min-w-[60px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-all duration-200',
                active
                  ? 'text-indigo-600 bg-indigo-500/10'
                  : 'text-gray-500 active:bg-white/50'
              )}
            >
              <item.icon className={cn('h-6 w-6', active ? 'text-indigo-500' : 'text-gray-400')} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
