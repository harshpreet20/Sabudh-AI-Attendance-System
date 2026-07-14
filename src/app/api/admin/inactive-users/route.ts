import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'

interface InactiveStudent {
  id: string
  full_name: string
  email: string
  phone: string | null
  batch_name: string | null
  status: string
  created_at: string
  last_sign_in_at: string | null
  last_active_at: string | null
}

// Surfaces students who have never signed in even once ("non-serious" users),
// plus last-seen data. GET returns JSON; GET?format=csv downloads a sheet.
async function buildInactiveList(): Promise<{ never: InactiveStudent[]; total: number }> {
  const supabase = createServiceClient()

  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, full_name, email, phone, status, created_at, last_active_at, auth_user_id, batch_id, batches(name)')

  const roster = students || []

  // Map auth_user_id -> last_sign_in_at via the admin API (paginated).
  const signInMap = new Map<string, string | null>()
  let page = 1
  for (;;) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (!data?.users?.length) break
    for (const u of data.users) signInMap.set(u.id, u.last_sign_in_at ?? null)
    if (data.users.length < 1000) break
    page++
  }

  const never: InactiveStudent[] = roster
    .filter((s) => !s.auth_user_id || !signInMap.get(s.auth_user_id))
    .map((s) => {
      const batchArr = s.batches as unknown as { name: string }[] | { name: string } | null
      const batch = Array.isArray(batchArr) ? batchArr[0] : batchArr
      return {
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        phone: s.phone,
        batch_name: batch?.name ?? null,
        status: s.status,
        created_at: s.created_at,
        last_sign_in_at: s.auth_user_id ? signInMap.get(s.auth_user_id) ?? null : null,
        last_active_at: s.last_active_at,
      }
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  return { never, total: roster.length }
}

function toCsv(rows: InactiveStudent[]): string {
  const header = ['Full Name', 'Email', 'Phone', 'Batch', 'Status', 'Account Created', 'Last Login']
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.email,
      r.phone || '',
      r.batch_name || '',
      r.status,
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      'Never',
    ]
      .map((v) => esc(String(v)))
      .join(','),
  )
  return [header.map(esc).join(','), ...lines].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { never, total } = await buildInactiveList()

    if (new URL(request.url).searchParams.get('format') === 'csv') {
      return new NextResponse(toCsv(never), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="never-logged-in-students-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: { never_logged_in: never.length, total_students: total },
        students: never,
      },
    })
  } catch (error) {
    console.error('[admin/inactive-users] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load inactive users' } },
      { status: 500 },
    )
  }
}
