import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAuth, getUserProfile, getUserRole } from '@/lib/auth/helpers'
import { DashboardShell } from '@/components/layout/dashboard-shell'

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

  const role = roleRecord?.role === 'admin' || roleRecord?.role === 'super_admin'
    ? 'admin'
    : 'student'

  // If an admin somehow lands here, redirect to admin dashboard
  if (role === 'admin') {
    redirect('/admin')
  }

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/dashboard'

  const userName = profile?.full_name || user.user_metadata?.full_name || 'Student'
  const userEmail = profile?.email || user.email || ''
  const avatarUrl = profile?.profile_image_url || null

  return (
    <DashboardShell
      role="student"
      currentPath={pathname}
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    >
      {children}
    </DashboardShell>
  )
}
