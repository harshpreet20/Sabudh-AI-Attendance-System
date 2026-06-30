'use client'

import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { Bell, Menu, User, Settings, LogOut } from 'lucide-react'
import Link from 'next/link'

interface HeaderProps {
  title?: string
  userName?: string
  userEmail?: string
  avatarUrl?: string | null
  notificationCount?: number
  onMenuClick?: () => void
}

export function Header({
  title = 'Dashboard',
  userName = 'User',
  userEmail = '',
  avatarUrl,
  notificationCount = 0,
  onMenuClick,
}: HeaderProps) {
  const router = useRouter()

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 glass-strong px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="rounded-xl p-2 text-gray-500 hover:bg-white/50 lg:hidden transition-all duration-200"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <h1 className="text-lg font-semibold text-gray-900 lg:text-xl">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-3">
        {/* Notification bell */}
        <Link
          href="/dashboard/notifications"
          className="relative rounded-xl p-2 text-gray-500 transition-all duration-200 hover:bg-white/50"
          aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </Link>

        {/* User avatar dropdown */}
        <DropdownMenu
          align="right"
          trigger={
            <Avatar
              src={avatarUrl}
              fallback={initials}
              size="sm"
              className="cursor-pointer ring-2 ring-white/40 hover:ring-indigo-300/50 transition-all duration-200"
            />
          }
        >
          <div className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{userName}</p>
            <p className="truncate text-xs text-gray-500">{userEmail}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </header>
  )
}
