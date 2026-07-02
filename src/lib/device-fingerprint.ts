export async function generateFingerprint(): Promise<string> {
  const components: string[] = []

  components.push(navigator.userAgent)
  components.push(navigator.language)
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`)
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone)
  components.push(String(navigator.hardwareConcurrency || 0))
  components.push(String(navigator.maxTouchPoints || 0))

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      canvas.width = 200
      canvas.height = 50
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillStyle = '#f60'
      ctx.fillRect(125, 1, 62, 20)
      ctx.fillStyle = '#069'
      ctx.fillText('Sabudh AI fp', 2, 15)
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
      ctx.fillText('Sabudh AI fp', 4, 17)
      components.push(canvas.toDataURL().slice(-50))
    }
  } catch {
    // Canvas not available
  }

  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
      }
    }
  } catch {
    // WebGL not available
  }

  const raw = components.join('|||')
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
