'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  X,
  Link as LinkIcon,
} from 'lucide-react'

interface ImportResult {
  email: string
  name: string
  status: 'created' | 'exists' | 'error'
  error?: string
}

interface ImportResponse {
  message: string
  total: number
  created: number
  exists: number
  errors: number
  results: ImportResult[]
}

interface Batch {
  id: string
  name: string
}

type ImportMode = 'csv' | 'sheet'

export default function ImportStudentsPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<ImportMode>('csv')
  const [sheetUrl, setSheetUrl] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [batchId, setBatchId] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fetchBatches = useCallback(async () => {
    const { data } = await supabase
      .from('batches')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
    setBatches((data as Batch[]) ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      setCsvFile(file)
    } else {
      toast.error('Please drop a .csv file')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setCsvFile(file)
  }

  async function handleImport() {
    setLoading(true)
    setResponse(null)

    try {
      let body: Record<string, unknown>

      if (mode === 'csv') {
        if (!csvFile) {
          toast.error('Please select a CSV file')
          setLoading(false)
          return
        }
        const csvText = await csvFile.text()
        body = { csvText, batchId: batchId || null }
      } else {
        if (!sheetUrl.trim()) {
          toast.error('Please enter a Google Sheet URL')
          setLoading(false)
          return
        }
        body = { sheetUrl: sheetUrl.trim(), batchId: batchId || null }
      }

      const res = await fetch('/api/admin/import-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Import failed')
        return
      }

      setResponse(data)
      toast.success(data.message)
    } catch {
      toast.error('Failed to import students')
    } finally {
      setLoading(false)
    }
  }

  const canImport = mode === 'csv' ? !!csvFile : !!sheetUrl.trim()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Students</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import student profiles from a CSV file or Google Sheet and send login credentials via email
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-100/60 p-1.5 backdrop-blur-sm">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            Import Students
          </CardTitle>
          <CardDescription>
            Upload a CSV file or provide a published Google Sheet URL.
            Duplicate emails are detected and skipped automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('csv')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                mode === 'csv'
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <Upload className="h-4 w-4" />
              CSV File Upload
            </button>
            <button
              onClick={() => setMode('sheet')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                mode === 'sheet'
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <LinkIcon className="h-4 w-4" />
              Google Sheet URL
            </button>
          </div>

          {mode === 'csv' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-all duration-200 ${
                  dragOver
                    ? 'border-indigo-400/80 bg-indigo-50/30'
                    : csvFile
                    ? 'border-emerald-300/60 bg-emerald-50/20'
                    : 'border-white/40 glass-input hover:border-indigo-400/60'
                }`}
              >
                {csvFile ? (
                  <>
                    <FileText className="h-10 w-10 text-emerald-500" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-900">{csvFile.name}</p>
                      <p className="text-xs text-gray-500">{(csvFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setCsvFile(null) }}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50/50 transition-colors"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-400">CSV files only</p>
                  </>
                )}
              </button>
            </div>
          ) : (
            <Input
              label="Google Sheet URL"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
          )}

          <Select
            label="Assign to Batch (optional)"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">No batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>

          <div className="rounded-xl bg-amber-50/60 border border-amber-200/50 p-4 backdrop-blur-sm">
            <h4 className="text-sm font-medium text-amber-800">Expected columns:</h4>
            <p className="mt-1 text-xs text-amber-700">
              <strong>Required:</strong> Full Name (or Name), Email address (or Email)<br />
              <strong>Optional:</strong> Phone Number, Date Of Birth, Grade / Year Level, Gender, City,
              Professional experience, Organization, Learning Goal
            </p>
            <p className="mt-2 text-xs text-amber-600">
              Existing students (matched by email) are detected and skipped.
            </p>
          </div>

          <Button
            onClick={handleImport}
            disabled={loading || !canImport}
            loading={loading}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {loading ? 'Importing...' : 'Import & Send Credentials'}
          </Button>
        </CardContent>
      </Card>

      {response && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
            <CardDescription>{response.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-emerald-50/60 p-3 text-center backdrop-blur-sm border border-emerald-200/40">
                <p className="text-2xl font-bold text-emerald-700">{response.created}</p>
                <p className="text-xs text-emerald-600">Created</p>
              </div>
              <div className="rounded-xl bg-indigo-50/60 p-3 text-center backdrop-blur-sm border border-indigo-200/40">
                <p className="text-2xl font-bold text-indigo-700">{response.exists}</p>
                <p className="text-xs text-indigo-600">Already Existed</p>
              </div>
              <div className="rounded-xl bg-red-50/60 p-3 text-center backdrop-blur-sm border border-red-200/40">
                <p className="text-2xl font-bold text-red-700">{response.errors}</p>
                <p className="text-xs text-red-600">Errors</p>
              </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {response.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl glass-subtle px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900">{r.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{r.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'created' && (
                      <Badge variant="success">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Created
                      </Badge>
                    )}
                    {r.status === 'exists' && (
                      <Badge variant="secondary">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Exists
                      </Badge>
                    )}
                    {r.status === 'error' && (
                      <Badge variant="destructive">
                        <XCircle className="mr-1 h-3 w-3" />
                        {r.error || 'Error'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
