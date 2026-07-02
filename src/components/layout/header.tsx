'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import {
  Bell,
  Menu,
  User,
  Settings,
  LogOut,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Award,
  Shield,
  Info,
  CheckCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read_at: string | null
  created_at: string
}

const typeIcons: Record<string, { icon: LucideIcon; color: string }> = {
  attendance_accepted: { icon: CheckCircle, color: 'text-green-600' },
  attendance_rejected: { icon: XCircle, color: 'text-red-600' },
  attendance_reminder: { icon: Clock, color: 'text-blue-600' },
  low_attendance: { icon: AlertTriangle, color: 'text-amber-600' },
  certificate_eligible: { icon: Award, color: 'text-amber-600' },
  account_suspended: { icon: Shield, color: 'text-red-600' },
  account_restored: { icon: Shield, color: 'text-green-600' },
  system: { icon: Info, color: 'text-gray-600' },
  info: { icon: Info, color: 'text-blue-600' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(notificationCount)
  const [notifOpen, setNotifOpen] = useState(false)

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8)

    if (data) setNotifications(data)

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)

    setUnreadCount(count ?? 0)
  }, [])

  useEffect(() => {
    if (notifOpen) fetchNotifications()
  }, [notifOpen, fetchNotifications])

  useEffect(() => {
    setUnreadCount(notificationCount)
  }, [notificationCount])

  async function markAllRead() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)

    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    setUnreadCount(0)
  }

  async function markRead(id: string) {
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)

    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 glass-strong px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-xl p-2 text-gray-500 hover:bg-white/50 lg:hidden transition-all duration-200"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-lg font-semibold text-gray-900 lg:text-xl">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-3">
        {/* Notification bell dropdown */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-xl p-2 text-gray-500 transition-all duration-200 hover:bg-white/50"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-2 w-80 sm:w-96 rounded-2xl glass shadow-spatial border border-white/30 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/50">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                      <Bell className="h-8 w-8" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const config = typeIcons[n.type] || typeIcons.info
                      const Icon = config.icon
                      return (
                        <button
                          key={n.id}
                          onClick={() => { if (!n.read_at) markRead(n.id) }}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/40 ${!n.read_at ? 'bg-indigo-50/40' : ''}`}
                        >
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm truncate ${!n.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.read_at && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="border-t border-gray-200/50 px-4 py-2.5">
                  <button
                    onClick={() => { setNotifOpen(false); router.push('/dashboard/notifications') }}
                    className="w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

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
