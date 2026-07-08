// Minimal, dependency-free CSV parsing shared by the bulk-upload importers.
// Handles quoted fields, escaped quotes and CRLF. For .xlsx the client converts
// to CSV before upload, so a single CSV path serves both .csv and .xlsx.

export function parseCSVLine(line: string): string[] {
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

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

// Parse CSV text into header-keyed row objects using normalized header names.
export function parseCSV(csv: string): ParsedCSV {
  const cleaned = csv.trimStart().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { headers: lines.length ? parseCSVLine(lines[0]).map(normalizeHeader) : [], rows: [] }

  const headers = parseCSVLine(lines[0]).map(normalizeHeader)
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').replace(/^"|"$/g, '').trim()
    })
    rows.push(row)
  }

  return { headers, rows }
}

// Find the first present value across a set of candidate normalized header names.
export function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const key of Object.keys(row)) {
    if (candidates.some((c) => key.includes(c))) {
      const v = row[key]
      if (v) return v
    }
  }
  return undefined
}
