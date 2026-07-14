'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabPanel } from '@/components/ui/tabs'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ShieldCheck } from 'lucide-react'

type Kind = 'faculty' | 'subjects'

interface ValidateResponse {
  validated: true
  detected_headers: string[]
  total_rows: number
  valid: number
  invalid: number
  errors: Array<{ row: number; error: string }>
  duplicates_in_file: string[]
  preview: Record<string, unknown>[]
}

interface ImportResponse {
  message: string
  total: number
  created: number
  exists: number
  errors: number
  row_errors?: Array<{ row: number; error: string }>
  results: Array<{ name: string; email?: string; status: string; error?: string }>
}

const TABS = [
  { value: 'faculty', label: 'Faculty' },
  { value: 'subjects', label: 'Subjects' },
]

const TEMPLATES: Record<Kind, string> = {
  faculty: 'full_name,email,phone,subject_expertise,qualification',
  subjects: 'code,name,description,credits',
}

export default function BulkUploadPage() {
  const [tab, setTab] = useState<Kind>('faculty')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6 text-indigo-500" />
          Bulk Upload
        </h1>
        <p className="text-sm text-gray-500">Import faculty and subjects from Excel/CSV with validation and partial import.</p>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onChange={(v) => setTab(v as Kind)} />

      <TabPanel value="faculty" activeTab={tab}>
        <ImportPanel kind="faculty" />
      </TabPanel>
      <TabPanel value="subjects" activeTab={tab}>
        <ImportPanel kind="subjects" />
      </TabPanel>
    </div>
  )
}

function ImportPanel({ kind }: { kind: Kind }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [validation, setValidation] = useState<ValidateResponse | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const endpoint = kind === 'faculty' ? '/api/admin/import-faculty' : '/api/admin/import-subjects'

  async function handleFile(file: File) {
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      toast.error('Please upload a .csv or .xlsx file')
      return
    }
    if (/\.xlsx$/i.test(file.name)) {
      toast.message('For .xlsx files, please export/save as CSV first — then upload or paste below.')
    }
    const text = await file.text()
    setCsvText(text)
    setValidation(null)
    setResult(null)
  }

  async function validate() {
    if (!csvText.trim()) {
      toast.error('Provide CSV content first')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, validateOnly: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Validation failed')
        return
      }
      setValidation(json)
    } finally {
      setBusy(false)
    }
  }

  async function runImport() {
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Import failed')
        return
      }
      setResult(json)
      setValidation(null)
      toast.success(json.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            Upload {kind === 'faculty' ? 'Faculty' : 'Subjects'} File
          </CardTitle>
          <CardDescription>
            Expected columns: <code className="text-xs">{TEMPLATES[kind]}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Choose file
            </Button>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[kind] + '\n')}`}
              download={`${kind}_template.csv`}
              className="text-sm text-indigo-600 self-center hover:underline"
            >
              Download template
            </a>
          </div>
          <Textarea
            placeholder="…or paste CSV content here"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={validate} loading={busy} disabled={busy}>
              <ShieldCheck className="h-4 w-4 mr-2" /> Validate
            </Button>
            <Button onClick={runImport} loading={busy} disabled={busy || !csvText.trim()}>
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation Report</CardTitle>
            <CardDescription>Detected columns: {validation.detected_headers.join(', ') || 'none'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{validation.total_rows} rows</Badge>
              <Badge variant="success">{validation.valid} valid</Badge>
              {validation.invalid > 0 && <Badge variant="destructive">{validation.invalid} invalid</Badge>}
              {validation.duplicates_in_file.length > 0 && (
                <Badge variant="warning">{validation.duplicates_in_file.length} in-file duplicates</Badge>
              )}
            </div>
            {validation.errors.length > 0 && (
              <div className="text-sm space-y-1">
                {validation.errors.slice(0, 15).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" /> Row {e.row}: {e.error}
                  </div>
                ))}
              </div>
            )}
            {validation.valid > 0 && (
              <Button onClick={runImport} loading={busy} disabled={busy}>
                Import {validation.valid} valid records
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Result</CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="success">{result.created} created</Badge>
              <Badge variant="secondary">{result.exists} existed</Badge>
              {result.errors > 0 && <Badge variant="destructive">{result.errors} failed</Badge>}
            </div>
            <div className="max-h-64 overflow-auto text-sm space-y-1">
              {result.results.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  {r.status === 'created' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  ) : r.status === 'error' ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span>{r.name || r.email}</span>
                  <span className="text-gray-400">— {r.status}</span>
                  {r.error && <span className="text-red-500 text-xs">({r.error})</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
