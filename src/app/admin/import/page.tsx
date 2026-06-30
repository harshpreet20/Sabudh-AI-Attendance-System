'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface ImportResult {
  email: string
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

export default function ImportStudentsPage() {
  const supabase = createClient()

  const [sheetUrl, setSheetUrl] = useState('')
  const [batchId, setBatchId] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ImportResponse | null>(null)

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

  async function handleImport() {
    if (!sheetUrl.trim()) {
      toast.error('Please enter a Google Sheet URL')
      return
    }

    setLoading(true)
    setResponse(null)

    try {
      const res = await fetch('/api/admin/import-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim(), batchId: batchId || null }),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Students</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import student profiles from a Google Sheet and send login credentials via email
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Google Sheet Import
          </CardTitle>
          <CardDescription>
            Publish your Google Sheet to the web (File → Share → Publish to web → CSV),
            then paste the URL below. The sheet must have at least &quot;Name&quot; and &quot;Email&quot; columns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Google Sheet URL"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />

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

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-medium text-amber-800">Expected columns:</h4>
            <p className="mt-1 text-xs text-amber-700">
              <strong>Required:</strong> Name, Email<br />
              <strong>Optional:</strong> Phone, City, Profession, Qualification, Organization, Gender, Goal/Interest
            </p>
          </div>

          <Button
            onClick={handleImport}
            disabled={loading || !sheetUrl.trim()}
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
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{response.created}</p>
                <p className="text-xs text-green-600">Created</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{response.exists}</p>
                <p className="text-xs text-blue-600">Already Existed</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{response.errors}</p>
                <p className="text-xs text-red-600">Errors</p>
              </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {response.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="text-sm text-gray-700">{r.email}</span>
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
