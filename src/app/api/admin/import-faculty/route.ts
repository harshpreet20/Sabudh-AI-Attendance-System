import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/helpers'
import { resend, FROM_EMAIL, generatePassword, welcomeEmailHtml } from '@/lib/resend'
import { parseCSV, pick } from '@/lib/csv'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

interface FacultyRow {
  full_name: string
  email: string
  phone?: string
  subject_expertise?: string
  qualification?: string
}

interface RowResult {
  email: string
  name: string
  status: 'created' | 'exists' | 'error'
  error?: string
  email_sent?: boolean
}

// Bulk-import faculty (instructors) from CSV/XLSX. Supports pre-import
// validation (?validate=1 returns parsed rows + errors without writing) and
// partial import: valid rows are created even if some rows fail.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { csvText, validateOnly } = await request.json()
    if (!csvText) {
      return NextResponse.json({ error: 'csvText is required' }, { status: 400 })
    }

    const { headers, rows: rawRows } = parseCSV(csvText)

    // Map + validate each row.
    const parsed: Array<{ row: FacultyRow | null; error?: string; raw: Record<string, string> }> = rawRows.map((r) => {
      const full_name = pick(r, ['full_name', 'name', 'faculty', 'instructor'])
      const email = pick(r, ['email', 'e_mail'])?.toLowerCase()
      if (!full_name || !email) {
        return { row: null, error: 'Missing required name or email', raw: r }
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { row: null, error: `Invalid email: ${email}`, raw: r }
      }
      return {
        row: {
          full_name,
          email,
          phone: pick(r, ['phone', 'mobile', 'contact']),
          subject_expertise: pick(r, ['subject', 'expertise', 'department', 'specialization']),
          qualification: pick(r, ['qualification', 'education', 'degree']),
        },
        raw: r,
      }
    })

    const validRows = parsed.filter((p) => p.row).map((p) => p.row!) as FacultyRow[]
    const rowErrors = parsed
      .map((p, i) => (p.error ? { row: i + 2, error: p.error } : null))
      .filter(Boolean)

    // Duplicate detection within the file.
    const seen = new Set<string>()
    const duplicatesInFile: string[] = []
    for (const r of validRows) {
      if (seen.has(r.email)) duplicatesInFile.push(r.email)
      seen.add(r.email)
    }

    if (validateOnly) {
      return NextResponse.json({
        validated: true,
        detected_headers: headers,
        total_rows: rawRows.length,
        valid: validRows.length,
        invalid: rowErrors.length,
        errors: rowErrors,
        duplicates_in_file: duplicatesInFile,
        preview: validRows.slice(0, 10),
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: `No valid rows found. Detected columns: ${headers.join(', ')}. Required: Name and Email.`, errors: rowErrors },
        { status: 400 },
      )
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : 'https://attendanceai.harshpreetbhasin.com/login'

    const results: RowResult[] = []
    const dedup = new Set<string>()

    for (const row of validRows) {
      if (dedup.has(row.email)) {
        results.push({ email: row.email, name: row.full_name, status: 'exists', error: 'Duplicate row in file' })
        continue
      }
      dedup.add(row.email)

      try {
        const { data: existing } = await admin
          .from('teacher_profiles')
          .select('id')
          .eq('email', row.email)
          .maybeSingle()
        if (existing) {
          results.push({ email: row.email, name: row.full_name, status: 'exists' })
          continue
        }

        const password = generatePassword()
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email: row.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.full_name, phone: row.phone },
        })

        if (authError || !authData.user) {
          results.push({ email: row.email, name: row.full_name, status: 'error', error: authError?.message || 'Auth creation failed' })
          continue
        }
        const userId = authData.user.id

        const { data: existingRole } = await admin
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', 'instructor')
          .maybeSingle()
        if (!existingRole) {
          await admin.from('user_roles').insert({ user_id: userId, role: 'instructor', organization_id: ORG_ID })
        }

        await admin.from('teacher_profiles').insert({
          auth_user_id: userId,
          organization_id: ORG_ID,
          full_name: row.full_name,
          email: row.email,
          phone: row.phone || null,
          subject_expertise: row.subject_expertise || null,
          qualification: row.qualification || null,
          status: 'active',
        })

        let emailSent = false
        if (process.env.RESEND_API_KEY) {
          try {
            const emailResult = await resend.emails.send({
              from: FROM_EMAIL,
              to: row.email,
              subject: 'Welcome to Sabudh AI Attendance — Faculty Access',
              html: welcomeEmailHtml({
                studentName: row.full_name,
                email: row.email,
                password,
                courseName: 'Sabudh AI Attendance (Faculty)',
                location: '',
                loginUrl,
              }),
            })
            emailSent = !emailResult.error
          } catch (err) {
            console.error(`[import-faculty] email failed for ${row.email}:`, err instanceof Error ? err.message : err)
          }
        }

        results.push({ email: row.email, name: row.full_name, status: 'created', email_sent: emailSent })
      } catch (err) {
        results.push({ email: row.email, name: row.full_name, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const exists = results.filter((r) => r.status === 'exists').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Imported ${created} faculty. ${exists} already existed, ${errors} failed.`,
      total: validRows.length,
      created,
      exists,
      errors,
      row_errors: rowErrors,
      results,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 })
  }
}
