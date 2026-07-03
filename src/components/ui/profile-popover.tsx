'use client'

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { cn } from '@/lib/utils'

interface ProfileData {
  full_name: string
  email: string
  profile_image_url: string | null
  phone?: string | null
  status?: string
  attendance_percentage?: number
  city?: string | null
  qualification?: string | null
  subject_expertise?: string | null
}

interface ProfilePopoverProps {
  profileId: string
  profileType: 'student' | 'teacher'
  lookupBy?: 'id' | 'auth_user_id'
  children: React.ReactNode
  className?: string
}

function ProfilePopover({ profileId, profileType, lookupBy = 'id', children, className }: ProfilePopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [profile, setProfile] = React.useState<ProfileData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()

    if (open) {
      setOpen(false)
      return
    }

    setOpen(true)

    if (profile) return

    setLoading(true)
    const supabase = createClient()
    const table = profileType === 'teacher' ? 'teacher_profiles' : 'student_profiles'
    const select = profileType === 'teacher'
      ? 'full_name, email, profile_image_url, phone, status, subject_expertise'
      : 'full_name, email, profile_image_url, phone, status, attendance_percentage, city, qualification'

    const { data } = await supabase
      .from(table)
      .select(select)
      .eq(lookupBy, profileId)
      .single()

    setProfile(data as ProfileData | null)
    setLoading(false)
  }

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        className="cursor-pointer rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1"
      >
        {children}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-1/2 z-50 mt-1 -translate-x-1/2 top-full animate-in fade-in-0 zoom-in-95"
        >
          <div className="w-64 rounded-xl border border-white/40 bg-white/90 p-4 shadow-xl backdrop-blur-xl">
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ) : profile ? (
              <div>
                <div className="flex items-center gap-3">
                  <Avatar
                    src={profile.profile_image_url}
                    fallback={initials}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{profile.full_name}</p>
                    <p className="truncate text-xs text-gray-500">{profile.email}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.status && (
                    <Badge
                      variant={profile.status === 'active' ? 'success' : profile.status === 'suspended' ? 'destructive' : 'warning'}
                      className="text-[10px]"
                    >
                      {profile.status}
                    </Badge>
                  )}
                  {profileType === 'student' && profile.attendance_percentage !== undefined && (
                    <Badge
                      variant={profile.attendance_percentage >= 75 ? 'success' : profile.attendance_percentage >= 50 ? 'warning' : 'destructive'}
                      className="text-[10px]"
                    >
                      {profile.attendance_percentage.toFixed(1)}% attendance
                    </Badge>
                  )}
                  {profileType === 'teacher' && profile.subject_expertise && (
                    <Badge variant="secondary" className="text-[10px]">{profile.subject_expertise}</Badge>
                  )}
                </div>
                {(profile.phone || profile.city || profile.qualification) && (
                  <div className="mt-2 space-y-0.5 text-xs text-gray-500 border-t border-gray-100 pt-2">
                    {profile.phone && <p>{profile.phone}</p>}
                    {profile.city && <p>{profile.city}</p>}
                    {profile.qualification && <p>{profile.qualification}</p>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-xs text-gray-400 py-2">Profile not found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { ProfilePopover }
