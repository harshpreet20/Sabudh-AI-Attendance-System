// Self-hosted document conversion worker.
// Converts PPT/PPTX/DOC/DOCX (and other office formats) to PDF using headless
// LibreOffice, so the main app can render them as secure interactive PDFs
// without ever exposing the original office file to students.
//
// POST /convert  { url, filename }  (header: x-convert-secret)
//   -> downloads `url`, converts to PDF, streams the PDF back (application/pdf)

const express = require('express')
const { execFile } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')

const app = express()
app.use(express.json({ limit: '4mb' }))

const SECRET = process.env.CONVERT_SECRET || ''
const PORT = process.env.PORT || 8080
const CONVERT_TIMEOUT_MS = 120000

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/convert', async (req, res) => {
  if (SECRET && req.headers['x-convert-secret'] !== SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const { url, filename } = req.body || {}
  if (!url || !filename) {
    return res.status(400).json({ error: 'url and filename are required' })
  }

  const workdir = path.join(os.tmpdir(), 'conv-' + randomUUID())
  try {
    await fs.mkdir(workdir, { recursive: true })
    const safeName = String(filename).replace(/[^\w.\-]/g, '_')
    const inputPath = path.join(workdir, safeName)

    const resp = await fetch(url)
    if (!resp.ok) return res.status(400).json({ error: `download failed (${resp.status})` })
    await fs.writeFile(inputPath, Buffer.from(await resp.arrayBuffer()))

    // Each conversion uses an isolated LibreOffice user profile so concurrent
    // requests don't clash on the shared default profile.
    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        [
          `-env:UserInstallation=file://${path.join(workdir, 'profile')}`,
          '--headless',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          workdir,
          inputPath,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
        (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(null)),
      )
    })

    const base = path.basename(inputPath).replace(/\.[^.]+$/, '')
    const pdf = await fs.readFile(path.join(workdir, base + '.pdf'))
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdf)
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'conversion failed' })
  } finally {
    fs.rm(workdir, { recursive: true, force: true }).catch(() => {})
  }
})

app.listen(PORT, () => console.log(`[doc-convert-worker] listening on ${PORT}`))
