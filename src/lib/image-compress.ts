interface CompressOptions {
  /** Longest edge (px) the image is scaled down to. */
  maxSize?: number
  /** JPEG/WebP quality 0–1. */
  quality?: number
  mimeType?: 'image/jpeg' | 'image/webp'
}

/**
 * Downscale and re-encode an image on the client before upload to cut file
 * size (and bandwidth/storage). Fails safe: on any error, an unsupported type,
 * or when compression wouldn't help, the original File is returned unchanged.
 * EXIF orientation is respected so portrait photos aren't rotated.
 */
export async function compressImage(
  file: File,
  { maxSize = 1280, quality = 0.82, mimeType = 'image/jpeg' }: CompressOptions = {}
): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return file
  // Only raster images; never touch GIFs (would drop animation) or non-images.
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  try {
    const source = await loadBitmap(file)
    let { width, height } = source
    if (!width || !height) return file

    const longest = Math.max(width, height)
    if (longest > maxSize) {
      const scale = maxSize / longest
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Flatten any transparency onto white (JPEG has no alpha).
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    if ('close' in source && typeof source.close === 'function') source.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality)
    )
    if (!blob || blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    const ext = mimeType === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${base}.${ext}`, { type: mimeType, lastModified: Date.now() })
  } catch {
    return file
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions)
    } catch {
      // Fall back to an <img> element below.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}
