import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? ''

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      if (next === '/reset-password') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: role } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single()

        if (!role) {
          const { data: existingStudent } = await supabase
            .from('student_profiles')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()

          if (!existingStudent) {
            const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'New User'

            await supabase.from('student_profiles').insert({
              auth_user_id: user.id,
              organization_id: ORG_ID,
              full_name: fullName,
              email: user.email || '',
              status: 'pending',
              preferred_language: 'en',
              attendance_percentage: 0,
              present_count: 0,
              absent_count: 0,
              late_count: 0,
              total_sessions: 0,
              risk_score: 0,
            })

            await supabase.from('user_roles').insert({
              user_id: user.id,
              role: 'student',
              organization_id: ORG_ID,
            })
          }

          const forwardedHost = request.headers.get('x-forwarded-host')
          const isLocalEnv = process.env.NODE_ENV === 'development'
          const redirectPath = '/pending-approval'

          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${redirectPath}`)
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
          }
          return NextResponse.redirect(`${origin}${redirectPath}`)
        }

        let redirectPath = next || '/dashboard'

        if (!next) {
          if (role.role === 'admin' || role.role === 'super_admin') {
            redirectPath = '/admin'
          } else if (role.role === 'instructor') {
            const { data: teacherProfile } = await supabase
              .from('teacher_profiles')
              .select('status')
              .eq('auth_user_id', user.id)
              .single()

            if (teacherProfile?.status === 'pending') {
              redirectPath = '/pending-approval'
            } else {
              redirectPath = '/teacher'
            }
          } else {
            const { data: studentProfile } = await supabase
              .from('student_profiles')
              .select('status')
              .eq('auth_user_id', user.id)
              .single()

            if (studentProfile?.status === 'pending') {
              redirectPath = '/pending-approval'
            } else {
              redirectPath = '/dashboard'
            }
          }
        }

        const forwardedHost = request.headers.get('x-forwarded-host')
        const isLocalEnv = process.env.NODE_ENV === 'development'

        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${redirectPath}`)
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
        } else {
          return NextResponse.redirect(`${origin}${redirectPath}`)
        }
      }
    }
  }

  return NextResponse.redirect(`${new URL(request.url).origin}/login?error=auth_callback_error`)
}
