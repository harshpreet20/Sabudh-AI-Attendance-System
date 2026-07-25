'use client'

import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image-compress'
import { runLocalOcr } from '@/lib/ocr-local'
import { toast } from 'sonner'
import { ScanLine, Upload, Check, X, Loader2 } from 'lucide-react'

interface Mark {
  student_id: string
  name: string
  present: boolean
}

interface OcrRegisterUploadProps {
  sessionId: string
  disabled?: boolean
  onApplied?: () => void
  className?: string
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Upload a photo of the physical attendance register for the selected session.
 * OpenAI vision reads who's marked present; the teacher reviews and confirms,
 * then present students get an approved record.
 */
export function OcrRegisterUpload({
  sessionId,
  disabled,
  onApplied,
  className,
}: OcrRegisterUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [marks, setMarks] = useState<Mark[] | null>(null)
  const [source, setSource] = useState<'local' | 'baidu' | 'openai' | null>(null)
  const [progress, setProgress] = useState(0)
  const [handwriting, setHandwriting] = useState(false)

  function reset() {
    setMarks(null)
    setSource(null)
    setReading(false)
    setApplying(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReading(true)
    setMarks(null)
    setSource(null)
    setProgress(0)
    try {
      const compressed = await compressImage(file, { maxSize: 1600, quality: 0.85 })

      // Tier 1: on-device OCR (free, private). Skipped for messy handwriting,
      // which the on-device engine can't read reliably.
      let handled = false
      if (!handwriting) {
        try {
          const lines = await runLocalOcr(compressed, (f) =>
            setProgress(Math.round(f * 100))
          )
          if (lines.length > 0) {
            const res = await fetch('/api/attendance/ocr/match', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sessionId, lines }),
            })
            const json = await res.json()
            if (res.ok && json.success && json.data.total > 0) {
              const rate = json.data.matched / json.data.total
              if (rate >= 0.5) {
                setMarks(json.data.results)
                setSource('local')
                handled = true
              }
            }
          }
        } catch {
          // On-device OCR unavailable/failed — fall through to cloud.
        }
      }

      // Tier 2: cloud OCR. 'accurate' (handwriting) → GPT-4o first; otherwise
      // free Baidu first, then GPT-4o.
      if (!handled) {
        const dataUrl = await fileToDataUrl(compressed)
        const res = await fetch('/api/attendance/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            image: dataUrl,
            mode: handwriting ? 'accurate' : 'cost',
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          toast.error(json?.error?.message ?? 'Could not read the register.')
          return
        }
        setMarks(json.data.results)
        setSource(json.data.source ?? null)
      }
    } catch {
      toast.error('Could not read the register. Please try again.')
    } finally {
      setReading(false)
      setProgress(0)
    }
  }

  function toggle(studentId: string) {
    setMarks((prev) =>
      prev
        ? prev.map((m) =>
            m.student_id === studentId ? { ...m, present: !m.present } : m
          )
        : prev
    )
  }

  async function apply() {
    if (!marks) return
    setApplying(true)
    try {
      const res = await fetch('/api/attendance/ocr/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, marks }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json?.error?.message ?? 'Could not save attendance.')
        return
      }
      toast.success(`Marked ${json.data.marked_present} present.`)
      onApplied?.()
      setOpen(false)
      reset()
    } catch {
      toast.error('Could not save attendance. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  const presentCount = marks?.filter((m) => m.present).length ?? 0

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? 'Select a session first' : undefined}
        className={className}
      >
        <ScanLine className="h-4 w-4" />
        Upload register
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false)
          reset()
        }}
        title="Upload attendance register"
        description="Take or upload a clear photo of the register. We'll read who's present for you to review."
        footer={
          marks ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
              >
                Cancel
              </Button>
              <Button onClick={apply} loading={applying}>
                <Check className="h-4 w-4" />
                Confirm {presentCount} present
              </Button>
            </>
          ) : undefined
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

        {!marks && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Messy handwriting</p>
              <p className="text-xs text-gray-500">
                Use the most accurate engine (best for handwritten registers).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={handwriting}
              disabled={reading}
              onClick={() => setHandwriting((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                handwriting ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  handwriting ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {!marks && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={reading}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-10 text-gray-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-60"
          >
            {reading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">
                  {progress > 0
                    ? `Reading on your device… ${progress}%`
                    : 'Reading the register…'}
                </span>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6" />
                <span className="text-sm font-medium">Tap to take or choose a photo</span>
              </>
            )}
          </button>
        )}

        {marks && (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-900">
                {presentCount} of {marks.length} present
              </span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Re-scan
              </button>
            </div>
            {source && (
              <p className="mb-3 text-[11px] text-gray-400">
                {source === 'local'
                  ? 'Read on your device (offline) — please double-check each student.'
                  : source === 'baidu'
                    ? 'Read with free OCR — please double-check each student.'
                    : 'Read with AI vision.'}
              </p>
            )}
            <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
              {marks.map((m) => (
                <li key={m.student_id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.student_id)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-800">{m.name}</span>
                    {m.present ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-600">
                        <Check className="h-3.5 w-3.5" />
                        Present
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-400">
                        <X className="h-3.5 w-3.5" />
                        Absent
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-400">
              Tap any student to flip present/absent before confirming.
            </p>
          </div>
        )}
      </Dialog>
    </>
  )
}
