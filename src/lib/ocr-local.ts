// On-device OCR using Tesseract.js. Runs entirely in the browser (WASM) — the
// image never leaves the device and there is no API cost. Tesseract's engine
// and language data are fetched once and cached by the browser. Loaded via
// dynamic import so it stays out of the main bundle.

export async function runLocalOcr(
  file: File | Blob,
  onProgress?: (fraction: number) => void
): Promise<string[]> {
  const Tesseract = (await import('tesseract.js')).default
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })

  const lines =
    data.lines && data.lines.length > 0
      ? data.lines.map((l) => l.text)
      : (data.text ?? '').split('\n')

  return lines.map((s) => s.trim()).filter(Boolean)
}
