// Client for the self-hosted LibreOffice conversion worker. Office documents
// are converted to PDF so the app can render them as secure interactive PDFs.

const OFFICE_RE = /(powerpoint|presentation|ms-?word|officedocument\.word|officedocument\.presentation|\bppt\b|pptx|\bdoc\b|docx)/i

export function isConvertible(fileType: string | null, fileName: string | null): boolean {
  const s = `${fileType || ''} ${fileName || ''}`
  if (/pdf/i.test(s)) return false
  return OFFICE_RE.test(s) || /\.(pptx?|docx?)$/i.test(fileName || '')
}

export function conversionConfigured(): boolean {
  return !!process.env.CONVERT_WORKER_URL
}

// Sends a signed download URL to the worker and returns the converted PDF bytes.
export async function convertToPdf(signedUrl: string, filename: string): Promise<Buffer> {
  const base = process.env.CONVERT_WORKER_URL
  if (!base) throw new Error('CONVERT_WORKER_URL is not configured')

  const res = await fetch(`${base.replace(/\/$/, '')}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-convert-secret': process.env.CONVERT_SECRET || '' },
    body: JSON.stringify({ url: signedUrl, filename }),
    signal: AbortSignal.timeout(135000),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error || ''
    } catch {
      /* ignore */
    }
    throw new Error(`Conversion worker error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
