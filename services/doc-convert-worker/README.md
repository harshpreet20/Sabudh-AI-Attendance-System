# Document Conversion Worker (LibreOffice)

Converts PPT / PPTX / DOC / DOCX (and other office formats) to **PDF** using
headless LibreOffice, so the Sabudh AI app can render lecture materials as secure
interactive PDFs without ever exposing the original office file to students.

This runs as a **separate container** (it can't run inside the serverless Next.js
app — LibreOffice needs a full OS). Deploy it anywhere that runs Docker (Fly.io,
Railway, Render, a VM, ECS, etc.).

## API

`POST /convert`
- Headers: `x-convert-secret: <CONVERT_SECRET>` (if the secret is configured)
- Body: `{ "url": "<signed download URL>", "filename": "deck.pptx" }`
- Response: `application/pdf` (the converted file) or `{ "error": "..." }`

`GET /health` → `{ ok: true }`

## Environment

| Var | Purpose |
|-----|---------|
| `PORT` | Listen port (default 8080) |
| `CONVERT_SECRET` | Shared secret; must match the app's `CONVERT_SECRET` |

## Run locally

```bash
docker build -t sabudh-convert ./services/doc-convert-worker
docker run -p 8080:8080 -e CONVERT_SECRET=dev-secret sabudh-convert
```

## Wire it to the app

Set on the Next.js app:

- `CONVERT_WORKER_URL` = the worker's base URL (e.g. `https://convert.yourhost.com`)
- `CONVERT_SECRET`     = the same secret as the worker

Once set, uploading a PPT/DOC to a lecture (or the "Convert" action) triggers
`/api/materials/[id]/convert`, which sends the file to this worker, stores the
returned PDF in the private `lecture-content` bucket, and the student workspace
renders that PDF. If `CONVERT_WORKER_URL` is unset, office files simply show a
"preview coming soon" placeholder — nothing breaks.
