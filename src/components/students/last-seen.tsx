'use client'

import { useEffect, useState } from 'react'
import { Clock, UserX } from 'lucide-react'

interface LastSeenData {
  last_sign_in_at: string | null
  last_active_at: string | null
  never_logged_in: boolean
}

function fmt(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Staff-only "last seen" indicator. Shows last login (auth) with a fallback to
// last activity, or a clear "Never logged in" badge for non-serious users.
export function LastSeen({
  studentId,
  authUserId,
  compact = false,
  className = '',
}: {
  studentId?: string
  authUserId?: string
  compact?: boolean
  className?: string
}) {
  const [data, setData] = useState<LastSeenData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const param = studentId ? `student_id=${studentId}` : authUserId ? `auth_user_id=${authUserId}` : ''
    if (!param) {
      setLoading(false)
      return
    }
    fetch(`/api/staff/last-seen?${param}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId, authUserId])

  if (loading) {
    return <span className={`text-xs text-gray-400 ${className}`}>Last seen…</span>
  }
  if (!data) return null

  if (data.never_logged_in) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium text-red-600 ${className}`}>
        <UserX className="h-3.5 w-3.5" />
        Never logged in
      </span>
    )
  }

  const when = data.last_sign_in_at || data.last_active_at
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-gray-500 ${className}`}>
      <Clock className="h-3.5 w-3.5" />
      {compact ? '' : 'Last seen '}
      {when ? fmt(when) : 'unknown'}
    </span>
  )
}
