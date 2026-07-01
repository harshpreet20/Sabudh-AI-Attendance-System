'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, LogOut } from 'lucide-react'
import Link from 'next/link'
import { LogoWithText } from '@/components/ui/logo'

export default function PendingApprovalPage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUserName(user.user_metadata?.full_name || user.email || '')

      const { data: role } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (role?.role === 'admin' || role?.role === 'super_admin') {
        router.push('/admin')
        return
      }

      if (role?.role === 'instructor') {
        const { data: tp } = await supabase
          .from('teacher_profiles')
          .select('status')
          .eq('auth_user_id', user.id)
          .single()

        if (tp?.status === 'active') {
          router.push('/teacher')
          return
        }
      } else {
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('status')
          .eq('auth_user_id', user.id)
          .single()

        if (sp && sp.status !== 'pending') {
          router.push('/dashboard')
          return
        }
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [router])

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4">
      <div className="w-full max-w-md text-center">
        <Link href="/">
          <LogoWithText />
        </Link>

        <div className="mt-8 glass rounded-2xl p-8 shadow-spatial">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100/70">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>

          <h1 className="mt-6 text-xl font-bold text-gray-900">Account Pending Approval</h1>

          {userName && (
            <p className="mt-2 text-sm text-gray-600">
              Welcome, <span className="font-medium">{userName}</span>
            </p>
          )}

          <p className="mt-4 text-sm text-gray-500 leading-relaxed">
            Your account has been created and is awaiting approval from an administrator.
            You will be able to access the platform once your account is approved.
          </p>

          <div className="mt-6 rounded-xl bg-indigo-50/70 border border-indigo-200/50 p-4">
            <p className="text-xs text-indigo-700">
              This page automatically checks your approval status every 30 seconds.
              You will be redirected once approved.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white/50 transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
