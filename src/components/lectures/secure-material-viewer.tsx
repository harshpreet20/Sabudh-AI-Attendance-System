'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, AlertCircle } from 'lucide-react'
import { PptxDeck } from './pptx-deck'

interface Props {
  lectureId: string
  material: { id: string; title?: string; file_name: string | null; file_type: string | null }
}

function isPptx(fileName: string | null, fileType: string | null): boolean {
  return /\.pptx?$/i.test(fileName || '') || /presentationml|powerpoint/i.test(fileType || '')
}

interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
}
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }

type Kind = 'pdf' | 'image' | 'text' | 'pptx' | 'other'

function kindOf(fileType: string | null, fileName: string | null): Kind {
  const t = `${fileType || ''} ${fileName || ''}`.toLowerCase()
  if (/pdf/.test(t)) return 'pdf'
  if (isPptx(fileName, fileType)) return 'pptx'
  if (/(png|jpe?g|gif|webp|svg|image)/.test(t)) return 'image'
  if (/(txt|md|markdown|text|plain)/.test(t)) return 'text'
  return 'other'
}

// Streams a lecture material via a short-lived signed URL and renders it in-app.
// The render type comes from the delivery response (so PPT/DOC converted to PDF
// render as PDF). PDFs are drawn to canvases with pdf.js — no browser download
// chrome; images/text render inline with download/right-click suppressed.
export function SecureMaterialViewer({ lectureId, material }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [viewKind, setViewKind] = useState<Kind | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Resolve a secure URL + render type.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setUrl('')
    setText('')
    setViewKind(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/lectures/${lectureId}/material/${material.id}`)
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.error?.message || 'Could not load this material')
          return
        }
        if (cancelled) return
        const vk = kindOf(json.data.file_type, json.data.file_name)
        setViewKind(vk)
        if (vk === 'text') {
          const t = await fetch(json.data.url).then((r) => r.text())
          if (!cancelled) setText(t)
        } else if (vk === 'pptx') {
          // PptxDeck loads slides via its own endpoint — no signed URL needed.
        } else if (!cancelled) {
          setUrl(json.data.url)
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
  }, [lectureId, material.id])

  const renderPdf = useCallback(async (signedUrl: string, isCancelled: () => boolean) => {
    const pdfjs = (await import('pdfjs-dist')) as unknown as {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (o: unknown) => { promise: Promise<PdfDoc> }
    }
    pdfjs.GlobalWorkerOptions.workerSrc = ''
    const doc = await pdfjs.getDocument({ url: signedUrl, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
    const container = containerRef.current
    if (!container || isCancelled()) return
    container.innerHTML = ''
    const maxPages = Math.min(doc.numPages, 120)
    for (let i = 1; i <= maxPages; i++) {
      if (isCancelled()) return
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

  // Render the PDF once the container is actually mounted. Surface failures
  // instead of leaving a blank box.
  useEffect(() => {
    if (viewKind !== 'pdf' || !url) return
    let cancelled = false
    renderPdf(url, () => cancelled).catch((e) => {
      console.error('[secure-viewer] pdf render failed:', e)
      if (!cancelled) setError('This document could not be displayed. Please try again.')
    })
    return () => {
      cancelled = true
    }
  }, [viewKind, url, renderPdf])

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

  if (viewKind === 'pptx') {
    return <PptxDeck lectureId={lectureId} materialId={material.id} title={material.title} />
  }
  if (viewKind === 'pdf') {
    return <div ref={containerRef} className="max-h-[70vh] overflow-y-auto rounded-lg bg-gray-100 p-3" onContextMenu={noContext} />
  }
  if (viewKind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={material.title || 'Material'} className="mx-auto max-h-[70vh] max-w-full rounded-lg select-none" draggable={false} onContextMenu={noContext} />
    )
  }
  if (viewKind === 'text') {
    return (
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800 select-none" onContextMenu={noContext}>
        {text}
      </pre>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <FileText className="h-8 w-8" />
      <p className="text-sm">This document is being prepared for interactive viewing.</p>
      <p className="text-xs text-gray-400">PPT/DOC files convert to an interactive PDF once the conversion worker processes them.</p>
    </div>
  )
}
