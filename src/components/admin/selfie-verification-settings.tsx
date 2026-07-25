'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-compress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Camera, Upload, X, Loader2, Sparkles } from 'lucide-react'

interface Config {
  enabled: boolean
  references: string[]
  description: string
}

export function SelfieVerificationSettings() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [config, setConfig] = useState<Config>({ enabled: false, references: [], description: '' })

  useEffect(() => {
    fetch('/api/admin/selfie-config')
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setConfig(j.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const supabase = createClient()
      const urls: string[] = []
      for (const file of files) {
        const compressed = await compressImage(file, { maxSize: 1280, quality: 0.8 })
        const path = `class-references/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error } = await supabase.storage
          .from('uploads')
          .upload(path, compressed, { upsert: true, contentType: compressed.type })
        if (error) {
          toast.error('Upload failed.')
          continue
        }
        const { data } = supabase.storage.from('uploads').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      setConfig((c) => ({ ...c, references: [...c.references, ...urls] }))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removeReference(url: string) {
    setConfig((c) => ({ ...c, references: c.references.filter((u) => u !== url) }))
  }

  const [reanalyzing, setReanalyzing] = useState(false)

  async function save(force = false) {
    const setBusy = force ? setReanalyzing : setSaving
    setBusy(true)
    try {
      const res = await fetch('/api/admin/selfie-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          references: config.references,
          force,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error('Could not save.')
        return
      }
      setConfig(json.data)
      toast.success(
        force
          ? 'Room re-analyzed.'
          : json.data.description
            ? 'Saved — classroom analyzed.'
            : 'Saved.'
      )
    } catch {
      toast.error('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4 text-gray-500" />
          Class Selfie Verification
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-gray-900">
                  Require a class selfie as a check
                </p>
                <p className="text-sm text-gray-500">
                  Students snap a selfie; it must match their profile photo and be
                  taken in this classroom.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={config.enabled}
                onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  config.enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    config.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-900">
                Reference photos of the classroom
              </p>
              <div className="flex flex-wrap gap-3">
                {config.references.map((url) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Classroom reference"
                      className="h-20 w-28 rounded-lg object-cover ring-1 ring-gray-200"
                    />
                    <button
                      onClick={() => removeReference(url)}
                      className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1 text-white shadow"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-[11px]">Add photo</span>
                    </>
                  )}
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
              <p className="mt-2 text-xs text-gray-400">
                Add 2–3 clear photos of the room. Saving analyzes them once with AI
                to learn the room; that understanding is reused for every selfie.
              </p>
            </div>

            {config.description && (
              <div className="rounded-xl bg-indigo-50/60 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  <Sparkles className="h-3.5 w-3.5" />
                  Room understanding
                </p>
                <p className="text-xs leading-relaxed text-gray-600">
                  {config.description}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {config.references.length > 0 && config.description && (
                <Button
                  variant="outline"
                  onClick={() => save(true)}
                  loading={reanalyzing}
                  disabled={saving}
                >
                  <Sparkles className="h-4 w-4" />
                  Re-analyze room
                </Button>
              )}
              <Button onClick={() => save(false)} loading={saving} disabled={reanalyzing}>
                Save{config.references.length ? ' & analyze' : ''}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
