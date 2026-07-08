'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/logo'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  CheckSquare,
  History,
  Award,
  Bell,
  User,
  Settings,
  Users,
  Calendar,
  Building2,
  BarChart3,
  FileText,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Upload,
  Megaphone,
  ClipboardList,
  GraduationCap,
  CalendarOff,
  ShieldCheck,
  FolderKanban,
  TrendingUp,
  UserPlus,
  MessageSquare,
  Bot,
  MapPin,
  BookOpen,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  badgeKey?: string
  children?: NavItem[]
}

const studentNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Attendance', icon: CheckSquare, href: '/dashboard/attendance' },
  { label: 'Leave', icon: CalendarOff, href: '/dashboard/leave', badgeKey: 'leave' },
  {
    label: 'Learning',
    icon: BookOpen,
    href: '/dashboard/curriculum',
    children: [
      { label: 'Curriculum', icon: BookOpen, href: '/dashboard/curriculum' },
      { label: 'Assignments', icon: ClipboardList, href: '/dashboard/assignments', badgeKey: 'assignments' },
      { label: 'Projects', icon: FolderKanban, href: '/dashboard/projects' },
    ],
  },
  {
    label: 'Progress',
    icon: TrendingUp,
    href: '/dashboard/history',
    children: [
      { label: 'History', icon: History, href: '/dashboard/history' },
      { label: 'Schedules', icon: Calendar, href: '/dashboard/schedules' },
      { label: 'My Journey', icon: MapPin, href: '/dashboard/journey' },
      { label: 'Certificate', icon: Award, href: '/dashboard/certificate' },
    ],
  },
  {
    label: 'Community',
    icon: MessageSquare,
    href: '/dashboard/discussions',
    children: [
      { label: 'Discussions', icon: MessageSquare, href: '/dashboard/discussions', badgeKey: 'discussions' },
      { label: 'Announcements', icon: Megaphone, href: '/dashboard/announcements', badgeKey: 'announcements' },
    ],
  },
  { label: 'Profile', icon: User, href: '/dashboard/profile' },
  { label: 'Settings', icon: Settings, href: '/dashboard/settings' },
]

const teacherNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/teacher' },
  { label: 'Students', icon: GraduationCap, href: '/teacher/students' },
  { label: 'Attendance', icon: CheckSquare, href: '/teacher/attendance' },
  { label: 'Leave Requests', icon: CalendarOff, href: '/teacher/leave', badgeKey: 'leave' },
  {
    label: 'Teaching',
    icon: BookOpen,
    href: '/teacher/curriculum',
    children: [
      { label: 'Curriculum', icon: BookOpen, href: '/teacher/curriculum' },
      { label: 'Assignments', icon: ClipboardList, href: '/teacher/assignments', badgeKey: 'assignments' },
      { label: 'Projects', icon: FolderKanban, href: '/teacher/projects', badgeKey: 'projects' },
      { label: 'Progress', icon: TrendingUp, href: '/teacher/progress' },
    ],
  },
  {
    label: 'Community',
    icon: MessageSquare,
    href: '/teacher/discussions',
    children: [
      { label: 'Discussions', icon: MessageSquare, href: '/teacher/discussions', badgeKey: 'discussions' },
      { label: 'Announcements', icon: Megaphone, href: '/teacher/announcements' },
    ],
  },
  { label: 'Schedules', icon: Calendar, href: '/teacher/schedules' },
  { label: 'Profile', icon: User, href: '/teacher/profile' },
]

const adminNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/admin',
    children: [
      { label: 'Overview', icon: LayoutDashboard, href: '/admin' },
      { label: 'Analytics', icon: BarChart3, href: '/admin/analytics' },
      { label: 'AI Insights', icon: Sparkles, href: '/admin/insights' },
      { label: 'Audit Logs', icon: FileText, href: '/admin/audit-logs' },
    ],
  },
  { label: 'Approvals', icon: ShieldCheck, href: '/admin/approvals', badgeKey: 'approvals' },
  {
    label: 'People',
    icon: Users,
    href: '/admin/students',
    children: [
      { label: 'Students', icon: Users, href: '/admin/students' },
      { label: 'Manage Users', icon: UserPlus, href: '/admin/users' },
      { label: 'Import Students', icon: Upload, href: '/admin/import' },
      { label: 'Bulk Upload', icon: FileSpreadsheet, href: '/admin/bulk-upload' },
    ],
  },
  {
    label: 'Classes',
    icon: Calendar,
    href: '/admin/attendance',
    children: [
      { label: 'Attendance', icon: CheckSquare, href: '/admin/attendance' },
      { label: 'Sessions', icon: Calendar, href: '/admin/sessions' },
      { label: 'Leave Requests', icon: CalendarOff, href: '/admin/leave', badgeKey: 'leave' },
      { label: 'Classrooms', icon: Building2, href: '/admin/classrooms' },
      { label: 'Campuses', icon: MapPin, href: '/admin/campuses' },
    ],
  },
  {
    label: 'Academics',
    icon: GraduationCap,
    href: '/admin/curriculum',
    children: [
      { label: 'Curriculum', icon: GraduationCap, href: '/admin/curriculum' },
      { label: 'Courses', icon: BookOpen, href: '/admin/courses' },
      { label: 'Certificates', icon: Award, href: '/admin/certificates' },
    ],
  },
  {
    label: 'Engagement',
    icon: MessageSquare,
    href: '/admin/discussions',
    children: [
      { label: 'Discussions', icon: MessageSquare, href: '/admin/discussions', badgeKey: 'discussions' },
      { label: 'Announcements', icon: Megaphone, href: '/admin/announcements', badgeKey: 'announcements' },
    ],
  },
  { label: 'Knowledge Base', icon: Bot, href: '/admin/knowledge-base' },
  { label: 'Settings', icon: Settings, href: '/admin/settings' },
]

interface SidebarProps {
  role: 'student' | 'teacher' | 'admin'
  currentPath: string
  userName?: string
  userEmail?: string
  avatarUrl?: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
  badgeCounts?: Record<string, number>
}

export function Sidebar({
  role,
  currentPath,
  userName = 'User',
  userEmail = '',
  avatarUrl,
  mobileOpen = false,
  onMobileClose,
  badgeCounts = {},
}: SidebarProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const navItems = role === 'admin' ? adminNavItems : role === 'teacher' ? teacherNavItems : studentNavItems

  // Determine which groups should be auto-expanded based on currentPath
  const initialExpanded = navItems
    .filter(
      (item) =>
        item.children &&
        (currentPath === item.href ||
          item.children.some((child) => currentPath.startsWith(child.href) && child.href !== item.href))
    )
    .map((item) => item.label)
  const [expandedGroups, setExpandedGroups] = useState<string[]>(initialExpanded)

  function toggleGroup(label: string) {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/dashboard' || href === '/admin' || href === '/teacher') {
      return currentPath === href
    }
    return currentPath.startsWith(href)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        <Logo size="md" />
        <div className="flex flex-col min-w-0">
          <span className="text-lg font-bold text-gray-900 leading-tight">Sabudh AI</span>
          <span className="text-[9px] font-medium text-gray-400 tracking-wide truncate">Powered by HotBot Studios</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.href)
          const count = item.badgeKey ? (badgeCounts[item.badgeKey] ?? 0) : 0

          if (item.children) {
            const isExpanded = expandedGroups.includes(item.label)
            const anyChildActive = item.children.some((child) => isActive(child.href))
            const parentActive = active || anyChildActive
            // Sum child badge counts so actionable items stay visible while collapsed.
            const childBadgeTotal = item.children.reduce(
              (sum, child) => sum + (child.badgeKey ? (badgeCounts[child.badgeKey] ?? 0) : 0),
              0
            )

            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault()
                    toggleGroup(item.label)
                    router.push(item.href)
                    onMobileClose?.()
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    parentActive
                      ? 'bg-indigo-500/10 text-indigo-700 shadow-sm backdrop-blur-sm'
                      : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
                  )}
                  aria-current={parentActive ? 'page' : undefined}
                  aria-expanded={isExpanded}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      parentActive ? 'text-indigo-500' : 'text-gray-400'
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {!isExpanded && childBadgeTotal > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                      {childBadgeTotal > 99 ? '99+' : childBadgeTotal}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                </Link>
                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-3">
                    {item.children.map((child) => {
                      const childActive = isActive(child.href)
                      const childCount = child.badgeKey ? (badgeCounts[child.badgeKey] ?? 0) : 0
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onMobileClose}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                            childActive
                              ? 'bg-indigo-500/10 text-indigo-700'
                              : 'text-gray-500 hover:bg-white/50 hover:text-gray-900'
                          )}
                          aria-current={childActive ? 'page' : undefined}
                        >
                          <child.icon
                            className={cn(
                              'h-4 w-4 shrink-0',
                              childActive ? 'text-indigo-500' : 'text-gray-400'
                            )}
                          />
                          <span className="flex-1 truncate">{child.label}</span>
                          {childCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                              {childCount > 99 ? '99+' : childCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm backdrop-blur-sm'
                  : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  active ? 'text-indigo-500' : 'text-gray-400'
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User profile section */}
      <div className="border-t border-white/20 p-4">
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} fallback={initials} size="sm" />
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-gray-900">
              {userName}
            </p>
            <Badge variant={role === 'admin' ? 'default' : role === 'teacher' ? 'default' : 'secondary'}>
              {role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Student'}
            </Badge>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-xl p-1.5 text-gray-400 transition-all duration-200 hover:bg-white/50 hover:text-gray-600"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 glass-strong lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 glass-strong shadow-spatial">
            <div className="absolute right-3 top-3">
              <button
                onClick={onMobileClose}
                className="rounded-xl p-1.5 text-gray-400 hover:bg-white/50 hover:text-gray-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
