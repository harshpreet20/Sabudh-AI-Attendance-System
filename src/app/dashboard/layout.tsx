import { redirect } from 'next/navigation'
import { requireAuth, getUserProfile, getUserRole } from '@/lib/auth/helpers'
import { StudentShellWrapper } from './shell-wrapper'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()

  const [profile, roleRecord] = await Promise.all([
    getUserProfile(user.id),
    getUserRole(user.id),
  ])

  if (roleRecord?.role === 'admin' || roleRecord?.role === 'super_admin') {
    redirect('/admin')
  }

  if (roleRecord?.role === 'instructor') {
    redirect('/teacher')
  }

  if (profile?.status === 'pending') {
    redirect('/pending-approval')
  }

  const userName = profile?.full_name || user.user_metadata?.full_name || 'Student'
  const userEmail = profile?.email || user.email || ''
  const avatarUrl = profile?.profile_image_url || null
  const profileComplete = !!profile?.profile_image_url
  const onboardingCompleted = profile?.onboarding_completed ?? false
  const studentProfileId = profile?.id ?? null

  return (
    <StudentShellWrapper
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
      profileComplete={profileComplete}
      onboardingCompleted={onboardingCompleted}
      studentProfileId={studentProfileId}
    >
      {children}
    </StudentShellWrapper>
  )
}
