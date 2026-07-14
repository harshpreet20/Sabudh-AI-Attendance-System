import JSZip from 'jszip'

// Server-side PPTX -> structured slides, so a PowerPoint becomes an immersive,
// interactive in-browser deck WITHOUT any external converter. The raw .pptx is
// never handed to the browser — only extracted text + images — which keeps the
// secure "no download" delivery intact.

export interface PptxSlide { index: number; lines: string[]; images: string[] }
export interface PptxDeck { slides: PptxSlide[]; slide_count: number }

const MAX_SLIDES = 200
const MAX_IMAGE_BYTES = 1_500_000 // skip very large images
const MAX_TOTAL_IMAGE_BYTES = 9_000_000 // bound the overall payload/cache size

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

// Text, grouped by paragraph (<a:p>) so bullet structure survives.
function slideLines(xml: string): string[] {
  const lines: string[] = []
  const paras = xml.split('<a:p>')
  for (const p of paras) {
    const runs = [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeEntities(m[1]))
    const line = runs.join('').replace(/\s+/g, ' ').trim()
    if (line) lines.push(line)
  }
  return lines
}

// Map a slide's embedded image relationship ids to their media paths.
function relImageTargets(relsXml: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = m[0]
    const id = tag.match(/Id="([^"]+)"/)?.[1]
    const target = tag.match(/Target="([^"]+)"/)?.[1]
    if (id && target && /media\//i.test(target)) map.set(id, target)
  }
  return map
}

function mimeFor(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'bmp') return 'image/bmp'
  return 'application/octet-stream'
}

// Resolve a rels Target (relative to ppt/slides/) into a zip path under ppt/.
function resolveMedia(target: string): string {
  const cleaned = target.replace(/^(\.\.\/)+/, '')
  return `ppt/${cleaned}`
}

export async function extractPptxSlides(data: Uint8Array | ArrayBuffer): Promise<PptxDeck> {
  const zip = await JSZip.loadAsync(data)

  // Slide files sorted by their numeric suffix.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0)
      return na - nb
    })
    .slice(0, MAX_SLIDES)

  let totalImageBytes = 0
  const slides: PptxSlide[] = []

  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i]
    const xml = await zip.files[path].async('string')
    const lines = slideLines(xml)

    const images: string[] = []
    const num = path.match(/slide(\d+)\.xml$/)?.[1]
    const relsPath = `ppt/slides/_rels/slide${num}.xml.rels`
    const relsFile = zip.files[relsPath]
    if (relsFile) {
      const relsXml = await relsFile.async('string')
      const embeds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1])
      const targets = relImageTargets(relsXml)
      const seen = new Set<string>()
      for (const rid of embeds) {
        const target = targets.get(rid)
        if (!target || seen.has(rid)) continue
        seen.add(rid)
        const mediaPath = resolveMedia(target)
        const mediaFile = zip.files[mediaPath]
        if (!mediaFile) continue
        const bytes = await mediaFile.async('uint8array')
        if (bytes.byteLength > MAX_IMAGE_BYTES) continue
        if (totalImageBytes + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) continue
        totalImageBytes += bytes.byteLength
        const b64 = Buffer.from(bytes).toString('base64')
        images.push(`data:${mimeFor(mediaPath)};base64,${b64}`)
      }
    }

    slides.push({ index: i + 1, lines, images })
  }

  return { slides, slide_count: slides.length }
}
