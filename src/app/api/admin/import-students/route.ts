'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/helpers'
import { resend, generatePassword, welcomeEmailHtml } from '@/lib/resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const COURSE_NAME = 'GEN AI Zero to One'
const LOCATION = 'GK Duggal Memorial Centre, J Block Singh Sabha Gurudwara, Rajouri Garden, New Delhi'

interface SheetRow {
  full_name: string
  email: string
  phone?: string
  city?: string
  profession?: string
  qualification?: string
  organization_name?: string
  gender?: string
  learning_goal?: string
}

function parseCSV(csv: string): SheetRow[] {
  const lines = csv.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))

  const nameIdx = headers.findIndex((h) => h.includes('name'))
  const emailIdx = headers.findIndex((h) => h.includes('email'))
  const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'))
  const cityIdx = headers.findIndex((h) => h.includes('city'))
  const profIdx = headers.findIndex((h) => h.includes('profession') || h.includes('occupation'))
  const qualIdx = headers.findIndex((h) => h.includes('qualification') || h.includes('education'))
  const orgIdx = headers.findIndex((h) => h.includes('organization') || h.includes('company'))
  const genderIdx = headers.findIndex((h) => h.includes('gender'))
  const goalIdx = headers.findIndex((h) => h.includes('goal') || h.includes('interest'))

  if (nameIdx === -1 || emailIdx === -1) return []

  const rows: SheetRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const email = cols[emailIdx]?.toLowerCase()
    const name = cols[nameIdx]
    if (!email || !name) continue

    rows.push({
      full_name: name,
      email,
      phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
      city: cityIdx >= 0 ? cols[cityIdx] || undefined : undefined,
      profession: profIdx >= 0 ? cols[profIdx] || undefined : undefined,
      qualification: qualIdx >= 0 ? cols[qualIdx] || undefined : undefined,
      organization_name: orgIdx >= 0 ? cols[orgIdx] || undefined : undefined,
      gender: genderIdx >= 0 ? cols[genderIdx]?.toLowerCase() || undefined : undefined,
      learning_goal: goalIdx >= 0 ? cols[goalIdx] || undefined : undefined,
    })
  }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const { sheetUrl, batchId } = await request.json()

    if (!sheetUrl) {
      return NextResponse.json({ error: 'Sheet URL is required' }, { status: 400 })
    }

    const csvUrl = sheetUrl.includes('/pub?')
      ? sheetUrl
      : sheetUrl
          .replace(/\/edit.*$/, '')
          .replace(/\/view.*$/, '') + '/export?format=csv'

    const csvResponse = await fetch(csvUrl)
    if (!csvResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch Google Sheet. Make sure it is published to the web (File → Share → Publish to web → CSV).' },
        { status: 400 }
      )
    }

    const csvText = await csvResponse.text()
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Sheet must have "Name" and "Email" columns.' },
        { status: 400 }
      )
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const results: Array<{ email: string; status: 'created' | 'exists' | 'error'; error?: string }> = []
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://sabudh-ai-attendance-system.vercel.app/login'

    for (const row of rows) {
      try {
        const { data: existingProfile } = await adminSupabase
          .from('student_profiles')
          .select('id')
          .eq('email', row.email)
          .maybeSingle()

        if (existingProfile) {
          results.push({ email: row.email, status: 'exists' })
          continue
        }

        const password = generatePassword()

        const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
          email: row.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.full_name },
        })

        if (authError || !authData.user) {
          results.push({ email: row.email, status: 'error', error: authError?.message || 'Auth creation failed' })
          continue
        }

        await adminSupabase.from('user_roles').insert({
          user_id: authData.user.id,
          role: 'student',
          organization_id: ORG_ID,
        })

        await adminSupabase.from('student_profiles').insert({
          auth_user_id: authData.user.id,
          organization_id: ORG_ID,
          batch_id: batchId || null,
          full_name: row.full_name,
          email: row.email,
          phone: row.phone || null,
          city: row.city || null,
          profession: row.profession || null,
          qualification: row.qualification || null,
          organization_name: row.organization_name || null,
          gender: row.gender || null,
          learning_goal: row.learning_goal || null,
          status: 'active',
        })

        if (process.env.RESEND_API_KEY) {
          try {
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
              to: row.email,
              subject: `🙏 Welcome to ${COURSE_NAME} — Your Credentials Inside`,
              html: welcomeEmailHtml({
                studentName: row.full_name,
                email: row.email,
                password,
                courseName: COURSE_NAME,
                location: LOCATION,
                loginUrl,
              }),
            })
          } catch {
            // Email send failure shouldn't block account creation
          }
        }

        results.push({ email: row.email, status: 'created' })
      } catch (err) {
        results.push({
          email: row.email,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const exists = results.filter((r) => r.status === 'exists').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Imported ${created} students. ${exists} already existed. ${errors} failed.`,
      total: rows.length,
      created,
      exists,
      errors,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
