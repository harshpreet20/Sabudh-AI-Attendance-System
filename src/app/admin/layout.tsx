import { requireAdmin, getUserProfile } from '@/lib/auth/helpers'
import { AdminShellWrapper } from './shell-wrapper'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await requireAdmin()
  const profile = await getUserProfile(user.id)

  return (
    <AdminShellWrapper
      userName={profile?.full_name ?? user.email ?? 'Admin'}
      userEmail={user.email ?? ''}
      avatarUrl={profile?.profile_image_url ?? null}
    >
      {children}
    </AdminShellWrapper>
  )
}
