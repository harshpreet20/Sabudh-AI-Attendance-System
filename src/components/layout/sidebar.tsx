'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
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
  Shield,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

const studentNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Attendance', icon: CheckSquare, href: '/dashboard/attendance' },
  { label: 'History', icon: History, href: '/dashboard/history' },
  { label: 'Certificate', icon: Award, href: '/dashboard/certificate' },
  { label: 'Notifications', icon: Bell, href: '/dashboard/notifications' },
  { label: 'Profile', icon: User, href: '/dashboard/profile' },
  { label: 'Settings', icon: Settings, href: '/dashboard/settings' },
]

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { label: 'Students', icon: Users, href: '/admin/students' },
  { label: 'Sessions', icon: Calendar, href: '/admin/sessions' },
  { label: 'Classrooms', icon: Building2, href: '/admin/classrooms' },
  { label: 'Analytics', icon: BarChart3, href: '/admin/analytics' },
  { label: 'Certificates', icon: Award, href: '/admin/certificates' },
  { label: 'Audit Logs', icon: FileText, href: '/admin/audit-logs' },
  { label: 'Settings', icon: Settings, href: '/admin/settings' },
]

interface SidebarProps {
  role: 'student' | 'admin'
  currentPath: string
  userName?: string
  userEmail?: string
  avatarUrl?: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({
  role,
  currentPath,
  userName = 'User',
  userEmail = '',
  avatarUrl,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const navItems = role === 'admin' ? adminNavItems : studentNavItems

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
    if (href === '/dashboard' || href === '/admin') {
      return currentPath === href
    }
    return currentPath.startsWith(href)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-900">Sabudh AI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  active ? 'text-blue-600' : 'text-gray-400'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User profile section */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} fallback={initials} size="sm" />
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-gray-900">
              {userName}
            </p>
            <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
              {role === 'admin' ? 'Admin' : 'Student'}
            </Badge>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200 bg-white lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-gray-200 bg-white shadow-xl">
            <div className="absolute right-3 top-3">
              <button
                onClick={onMobileClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
