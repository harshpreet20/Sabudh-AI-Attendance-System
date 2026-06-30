import { redirect } from 'next/navigation'
import { requireAuth, getTeacherProfile, getUserRole } from '@/lib/auth/helpers'
import { TeacherShellWrapper } from './shell-wrapper'

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  const [profile, roleRecord] = await Promise.all([
    getTeacherProfile(user.id),
    getUserRole(user.id),
  ])

  if (roleRecord?.role === 'admin' || roleRecord?.role === 'super_admin') {
    redirect('/admin')
  }

  if (roleRecord?.role !== 'instructor') {
    redirect('/dashboard')
  }

  if (profile?.status === 'pending') {
    redirect('/pending-approval')
  }

  const userName = profile?.full_name ?? user.user_metadata?.full_name ?? user.email ?? 'Teacher'
  const userEmail = profile?.email ?? user.email ?? ''
  const avatarUrl = profile?.profile_image_url ?? null

  return (
    <TeacherShellWrapper
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
    </TeacherShellWrapper>
  )
}
