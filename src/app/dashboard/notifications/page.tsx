'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabPanel } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Bell,
  BellOff,
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
import type { Notification, NotificationType } from '@/types/database'

const typeConfig: Record<
  NotificationType,
  { icon: LucideIcon; color: string; bgColor: string }
> = {
  attendance_accepted: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
  attendance_rejected: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
  attendance_reminder: { icon: Clock, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  low_attendance: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  certificate_eligible: { icon: Award, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  account_suspended: { icon: Shield, color: 'text-red-600', bgColor: 'bg-red-100' },
  account_restored: { icon: Shield, color: 'text-green-600', bgColor: 'bg-green-100' },
  system: { icon: Info, color: 'text-gray-600', bgColor: 'bg-gray-100' },
  info: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-100' },
}

const filterTabs = [
  { value: 'all', label: 'All' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'system', label: 'System' },
]

const attendanceTypes: NotificationType[] = [
  'attendance_accepted',
  'attendance_rejected',
  'attendance_reminder',
  'low_attendance',
]

const systemTypes: NotificationType[] = [
  'system',
  'info',
  'account_suspended',
  'account_restored',
  'certificate_eligible',
]

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setNotifications(data as Notification[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  async function markAsRead(notificationId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      )
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMarkingAll(false)
      return
    }

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        }))
      )
      toast.success('All notifications marked as read.')
    } else {
      toast.error('Failed to mark notifications as read.')
    }
    setMarkingAll(false)
  }

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'all') return true
    if (activeTab === 'attendance') return attendanceTypes.includes(n.type)
    if (activeTab === 'system') return systemTypes.includes(n.type)
    return true
  })

  const unreadCount = notifications.filter((n) => !n.read_at).length

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} shape="rect" height={80} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up!'}
          </span>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllAsRead}
            loading={markingAll}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <Tabs tabs={filterTabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Notifications list */}
      <TabPanel value={activeTab} activeTab={activeTab}>
        {filteredNotifications.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="No notifications"
            description={
              activeTab === 'all'
                ? 'You have no notifications yet.'
                : `No ${activeTab} notifications.`
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const config = typeConfig[notification.type] || typeConfig.info
              const Icon = config.icon

              return (
                <Card
                  key={notification.id}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                    !notification.read_at ? 'border-blue-200 bg-blue-50/30' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read_at) {
                      markAsRead(notification.id)
                    }
                  }}
                >
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className={`mt-0.5 shrink-0 rounded-full p-2 ${config.bgColor}`}>
                      <Icon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${
                            notification.read_at
                              ? 'font-medium text-gray-700'
                              : 'font-semibold text-gray-900'
                          }`}
                        >
                          {notification.title}
                        </p>
                        {!notification.read_at && (
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {notification.message}
                      </p>
                      <p className="mt-1.5 text-xs text-gray-400">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </TabPanel>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined,
  })
}
