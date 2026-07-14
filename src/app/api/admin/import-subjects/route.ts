import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCSV, pick } from '@/lib/csv'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

interface SubjectRow {
  name: string
  code?: string
  description?: string
  credits?: number
}

// Bulk-import subjects from CSV/XLSX with pre-import validation, in-file
// duplicate detection and partial import of valid rows.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { csvText, validateOnly } = await request.json()
    if (!csvText) return NextResponse.json({ error: 'csvText is required' }, { status: 400 })

    const { headers, rows: rawRows } = parseCSV(csvText)

    const parsed = rawRows.map((r) => {
      const name = pick(r, ['subject_name', 'name', 'subject', 'title'])
      if (!name) return { row: null as SubjectRow | null, error: 'Missing subject name' }
      const creditsRaw = pick(r, ['credit', 'credits'])
      const credits = creditsRaw ? parseInt(creditsRaw) : undefined
      return {
        row: {
          name,
          code: pick(r, ['code', 'subject_code']),
          description: pick(r, ['description', 'desc']),
          credits: credits != null && !isNaN(credits) ? credits : undefined,
        } as SubjectRow,
        error: undefined as string | undefined,
      }
    })

    const validRows = parsed.filter((p) => p.row).map((p) => p.row!) as SubjectRow[]
    const rowErrors = parsed
      .map((p, i) => (p.error ? { row: i + 2, error: p.error } : null))
      .filter(Boolean)

    const seen = new Set<string>()
    const duplicatesInFile: string[] = []
    for (const r of validRows) {
      const key = (r.code || r.name).toLowerCase()
      if (seen.has(key)) duplicatesInFile.push(r.code || r.name)
      seen.add(key)
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
        { error: `No valid rows. Detected columns: ${headers.join(', ')}. Required: subject Name.`, errors: rowErrors },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const results: Array<{ name: string; status: 'created' | 'exists' | 'error'; error?: string }> = []
    const dedup = new Set<string>()

    for (const row of validRows) {
      const key = (row.code || row.name).toLowerCase()
      if (dedup.has(key)) {
        results.push({ name: row.name, status: 'exists', error: 'Duplicate row in file' })
        continue
      }
      dedup.add(key)

      try {
        if (row.code) {
          const { data: existing } = await supabase
            .from('subjects')
            .select('id')
            .eq('organization_id', ORG_ID)
            .eq('code', row.code)
            .maybeSingle()
          if (existing) {
            results.push({ name: row.name, status: 'exists' })
            continue
          }
        }

        const { error } = await supabase.from('subjects').insert({
          organization_id: ORG_ID,
          name: row.name,
          code: row.code || null,
          description: row.description || null,
          credits: row.credits ?? null,
          status: 'active',
        })
        if (error) {
          results.push({ name: row.name, status: 'error', error: error.message })
        } else {
          results.push({ name: row.name, status: 'created' })
        }
      } catch (err) {
        results.push({ name: row.name, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const exists = results.filter((r) => r.status === 'exists').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Imported ${created} subjects. ${exists} already existed, ${errors} failed.`,
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
