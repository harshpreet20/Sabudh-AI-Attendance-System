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
  alternate_phone?: string
  date_of_birth?: string
  city?: string
  profession?: string
  qualification?: string
  organization_name?: string
  gender?: string
  learning_goal?: string
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function matchesAny(header: string, patterns: string[]): boolean {
  return patterns.some(p => header.includes(p))
}

function parseCSV(csv: string): SheetRow[] {
  const lines = csv.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const rawHeaders = parseCSVLine(lines[0])
  const headers = rawHeaders.map(normalizeHeader)

  const nameIdx = headers.findIndex((h) => matchesAny(h, ['full_name', 'name']))
  const emailIdx = headers.findIndex((h) => matchesAny(h, ['email']))
  const phoneIdx = headers.findIndex((h) =>
    matchesAny(h, ['phone_number', 'phone', 'mobile']) && !h.includes('alternate')
  )
  const altPhoneIdx = headers.findIndex((h) => matchesAny(h, ['alternate_phone']))
  const dobIdx = headers.findIndex((h) => matchesAny(h, ['date_of_birth', 'dob', 'birth']))
  const cityIdx = headers.findIndex((h) => matchesAny(h, ['city']))
  const profIdx = headers.findIndex((h) =>
    matchesAny(h, ['profession', 'occupation', 'professional_experience', 'what_s_your_professional'])
  )
  const qualIdx = headers.findIndex((h) =>
    matchesAny(h, ['qualification', 'education', 'grade_year_level', 'grade'])
  )
  const orgIdx = headers.findIndex((h) => matchesAny(h, ['organization', 'company', 'college']))
  const genderIdx = headers.findIndex((h) => matchesAny(h, ['gender']))
  const goalIdx = headers.findIndex((h) =>
    matchesAny(h, ['goal', 'interest', 'prior_programming', 'ai_experience'])
  )

  if (nameIdx === -1 || emailIdx === -1) return []

  const rows: SheetRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const email = cols[emailIdx]?.toLowerCase().replace(/^"|"$/g, '')
    const name = cols[nameIdx]?.replace(/^"|"$/g, '')
    if (!email || !name) continue

    let dob: string | undefined
    if (dobIdx >= 0 && cols[dobIdx]) {
      const raw = cols[dobIdx].replace(/^"|"$/g, '')
      const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (ddmmyyyy) {
        dob = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`
      } else {
        dob = raw
      }
    }

    rows.push({
      full_name: name,
      email,
      phone: phoneIdx >= 0 ? cols[phoneIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      alternate_phone: altPhoneIdx >= 0 ? cols[altPhoneIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      date_of_birth: dob,
      city: cityIdx >= 0 ? cols[cityIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      profession: profIdx >= 0 ? cols[profIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      qualification: qualIdx >= 0 ? cols[qualIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      organization_name: orgIdx >= 0 ? cols[orgIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
      gender: genderIdx >= 0 ? cols[genderIdx]?.replace(/^"|"$/g, '').toLowerCase() || undefined : undefined,
      learning_goal: goalIdx >= 0 ? cols[goalIdx]?.replace(/^"|"$/g, '') || undefined : undefined,
    })
  }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const { sheetUrl, csvText, batchId, duplicateAction = 'skip' } = await request.json()

    let csvData: string

    if (csvText) {
      csvData = csvText
    } else if (sheetUrl) {
      const csvUrl = sheetUrl.includes('/pub?')
        ? sheetUrl
        : sheetUrl
            .replace(/\/edit.*$/, '')
            .replace(/\/view.*$/, '') + '/export?format=csv'

      const csvResponse = await fetch(csvUrl)
      if (!csvResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch Google Sheet. Make sure it is published to the web (File > Share > Publish to web > CSV).' },
          { status: 400 }
        )
      }
      csvData = await csvResponse.text()
    } else {
      return NextResponse.json({ error: 'Provide sheetUrl or csvText' }, { status: 400 })
    }

    const rows = parseCSV(csvData)

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. The file must have "Name" and "Email" columns.' },
        { status: 400 }
      )
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const results: Array<{ email: string; name: string; status: 'created' | 'exists' | 'updated' | 'error'; error?: string; email_sent?: boolean; email_error?: string }> = []
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    for (const row of rows) {
      try {
        const { data: existingProfile } = await adminSupabase
          .from('student_profiles')
          .select('id, batch_id')
          .eq('email', row.email)
          .maybeSingle()

        if (existingProfile) {
          if (duplicateAction === 'update') {
            try {
              const updateFields: Record<string, unknown> = {}
              if (row.full_name) updateFields.full_name = row.full_name
              if (row.phone) updateFields.phone = row.phone
              if (row.date_of_birth) updateFields.date_of_birth = row.date_of_birth
              if (row.city) updateFields.city = row.city
              if (row.profession) updateFields.profession = row.profession
              if (row.qualification) updateFields.qualification = row.qualification
              if (row.organization_name) updateFields.organization_name = row.organization_name
              if (row.gender) updateFields.gender = row.gender
              if (row.learning_goal) updateFields.learning_goal = row.learning_goal
              if (batchId && !existingProfile.batch_id) updateFields.batch_id = batchId

              if (Object.keys(updateFields).length > 0) {
                await adminSupabase
                  .from('student_profiles')
                  .update(updateFields)
                  .eq('id', existingProfile.id)
              }

              results.push({ email: row.email, name: row.full_name, status: 'updated' })
            } catch (err) {
              results.push({
                email: row.email,
                name: row.full_name,
                status: 'error',
                error: err instanceof Error ? err.message : 'Update failed',
              })
            }
          } else {
            results.push({ email: row.email, name: row.full_name, status: 'exists' })
          }
          continue
        }

        const password = generatePassword()

        const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
          email: row.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.full_name,
            phone: row.phone,
            date_of_birth: row.date_of_birth,
            qualification: row.qualification,
            profession: row.profession,
            city: row.city,
            organization_name: row.organization_name,
            gender: row.gender,
            learning_goal: row.learning_goal,
          },
        })

        if (authError || !authData.user) {
          results.push({ email: row.email, name: row.full_name, status: 'error', error: authError?.message || 'Auth creation failed' })
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
          date_of_birth: row.date_of_birth || null,
          city: row.city || null,
          profession: row.profession || null,
          qualification: row.qualification || null,
          organization_name: row.organization_name || null,
          gender: row.gender || null,
          learning_goal: row.learning_goal || null,
          emergency_contact: row.alternate_phone || null,
          status: 'active',
        })

        let emailSent = false
        let emailError: string | undefined

        if (process.env.RESEND_API_KEY) {
          try {
            const emailResult = await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'Sabudh Foundation <noreply@sabudh.org>',
              to: row.email,
              subject: `Welcome to ${COURSE_NAME} - Your Credentials Inside`,
              html: welcomeEmailHtml({
                studentName: row.full_name,
                email: row.email,
                password,
                courseName: COURSE_NAME,
                location: LOCATION,
                loginUrl,
              }),
            })
            emailSent = !emailResult.error
            if (emailResult.error) emailError = emailResult.error.message
          } catch (err) {
            emailError = err instanceof Error ? err.message : 'Email send failed'
          }
        } else {
          emailError = 'RESEND_API_KEY is not configured'
        }

        results.push({ email: row.email, name: row.full_name, status: 'created', email_sent: emailSent, email_error: emailError })
      } catch (err) {
        results.push({
          email: row.email,
          name: row.full_name,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const updated = results.filter((r) => r.status === 'updated').length
    const exists = results.filter((r) => r.status === 'exists').length
    const errors = results.filter((r) => r.status === 'error').length
    const emailsSent = results.filter((r) => r.email_sent).length
    const emailsFailed = results.filter((r) => r.status === 'created' && !r.email_sent).length

    const messageParts = [`Imported ${created} students`]
    if (updated > 0) messageParts.push(`${updated} updated`)
    if (exists > 0) messageParts.push(`${exists} already existed`)
    if (errors > 0) messageParts.push(`${errors} failed`)
    if (emailsSent > 0) messageParts.push(`${emailsSent} welcome emails sent`)
    if (emailsFailed > 0) messageParts.push(`${emailsFailed} emails failed`)

    return NextResponse.json({
      message: messageParts.join('. ') + '.',
      total: rows.length,
      created,
      updated,
      exists,
      errors,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
