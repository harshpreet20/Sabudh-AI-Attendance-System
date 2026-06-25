import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserRole, UserRoleRecord, StudentProfile } from '@/types/database'

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export async function getUserRole(
  userId: string,
): Promise<UserRoleRecord | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return data as UserRoleRecord
}

export async function getUserProfile(
  userId: string,
): Promise<StudentProfile | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('auth_user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return data as StudentProfile
}

export async function requireAuth() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireAdmin() {
  const user = await requireAuth()

  const role = await getUserRole(user.id)

  if (!role || !(['admin', 'super_admin'] as UserRole[]).includes(role.role)) {
    redirect('/dashboard')
  }

  return { user, role }
}
