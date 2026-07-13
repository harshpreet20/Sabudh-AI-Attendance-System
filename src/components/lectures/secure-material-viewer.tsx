'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, AlertCircle } from 'lucide-react'

interface Props {
  lectureId: string
  material: { id: string; title?: string; file_name: string | null; file_type: string | null }
}

interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
}
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }

function kind(m: Props['material']): 'pdf' | 'image' | 'text' | 'other' {
  const t = `${m.file_type || ''} ${m.file_name || ''}`.toLowerCase()
  if (/pdf/.test(t)) return 'pdf'
  if (/(png|jpe?g|gif|webp|svg|image)/.test(t)) return 'image'
  if (/(txt|md|markdown|text|plain)/.test(t)) return 'text'
  return 'other'
}

// Streams a lecture material via a short-lived signed URL and renders it in-app.
// PDFs are drawn to canvases with pdf.js (no browser download chrome); images
// and text are rendered inline with download/right-click suppressed.
export function SecureMaterialViewer({ lectureId, material }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const k = kind(material)

  const renderPdf = useCallback(async (signedUrl: string, cancelled: boolean) => {
    const pdfjs = (await import('pdfjs-dist')) as unknown as {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (o: unknown) => { promise: Promise<PdfDoc> }
    }
    pdfjs.GlobalWorkerOptions.workerSrc = ''
    const doc = await pdfjs.getDocument({ url: signedUrl, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
    const container = containerRef.current
    if (!container || cancelled) return
    container.innerHTML = ''
    const maxPages = Math.min(doc.numPages, 100)
    for (let i = 1; i <= maxPages; i++) {
      if (cancelled) return
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1.4 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.className = 'mx-auto mb-3 max-w-full rounded shadow-sm'
      canvas.style.userSelect = 'none'
      const ctx = canvas.getContext('2d')
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise
        container.appendChild(canvas)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setUrl('')
    setText('')
    ;(async () => {
      try {
        const res = await fetch(`/api/lectures/${lectureId}/material/${material.id}`)
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.error?.message || 'Could not load this material')
          return
        }
        const signedUrl: string = json.data.url
        if (cancelled) return

        if (k === 'pdf') {
          await renderPdf(signedUrl, cancelled)
        } else if (k === 'text') {
          const t = await fetch(signedUrl).then((r) => r.text())
          if (!cancelled) setText(t)
        } else if (k === 'image') {
          if (!cancelled) setUrl(signedUrl)
        }
      } catch {
        if (!cancelled) setError('Could not load this material')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, material.id])

  const noContext = (e: React.MouseEvent | React.DragEvent) => e.preventDefault()

  if (loading) return <Skeleton className="h-96 w-full" />
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (k === 'pdf') {
    return <div ref={containerRef} className="max-h-[70vh] overflow-y-auto rounded-lg bg-gray-100 p-3" onContextMenu={noContext} />
  }
  if (k === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={material.title || 'Material'} className="mx-auto max-h-[70vh] max-w-full rounded-lg select-none" draggable={false} onContextMenu={noContext} />
    )
  }
  if (k === 'text') {
    return (
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800 select-none" onContextMenu={noContext}>
        {text}
      </pre>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <FileText className="h-8 w-8" />
      <p className="text-sm">In-app preview for this file type is coming soon.</p>
      <p className="text-xs text-gray-400">PPT/DOC interactive conversion arrives in Phase 2; a PDF version renders fully today.</p>
    </div>
  )
}
