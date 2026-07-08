// Offline Attendance Mode — client-side encrypted queue.
//
// Captures taken while offline are encrypted with AES-GCM (Web Crypto) and
// persisted to localStorage. The AES key is generated once per device and kept
// non-extractable in IndexedDB, so queued attendance is never stored in
// plaintext. Once connectivity returns the queue is replayed to the server,
// which re-runs GPS/geofence verification before accepting anything.

export interface OfflineCapture {
  client_dedup_key: string
  session_id: string
  latitude: number
  longitude: number
  location_accuracy?: number | null
  device_fingerprint?: string | null
  captured_at: string
}

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'rejected' | 'error'

export interface QueueItem extends OfflineCapture {
  status: QueueItemStatus
  reason?: string
}

const STORAGE_KEY = 'sabudh.attendance.offline.v1'
const DB_NAME = 'sabudh-offline'
const STORE_NAME = 'keys'
const KEY_ID = 'aesKey'

// --- Key management (non-extractable AES-GCM key in IndexedDB) --------------
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb()
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(KEY_ID)
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
    req.onerror = () => reject(req.error)
  })
  if (existing) return existing

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(key, KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return key
}

// --- Encryption helpers -----------------------------------------------------
async function encrypt(items: QueueItem[]): Promise<string> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(items))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const payload = { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) }
  return JSON.stringify(payload)
}

async function decrypt(raw: string): Promise<QueueItem[]> {
  try {
    const key = await getOrCreateKey()
    const parsed = JSON.parse(raw) as { iv: number[]; data: number[] }
    const iv = new Uint8Array(parsed.iv)
    const cipher = new Uint8Array(parsed.data)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return JSON.parse(new TextDecoder().decode(plain)) as QueueItem[]
  } catch {
    return []
  }
}

// --- Public queue API -------------------------------------------------------
export async function readQueue(): Promise<QueueItem[]> {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  return decrypt(raw)
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  localStorage.setItem(STORAGE_KEY, await encrypt(items))
}

export async function enqueue(capture: OfflineCapture): Promise<QueueItem[]> {
  const items = await readQueue()
  // Dedup by session — one queued capture per session.
  if (items.some((i) => i.session_id === capture.session_id && i.status !== 'rejected')) {
    return items
  }
  items.push({ ...capture, status: 'pending' })
  await writeQueue(items)
  return items
}

export async function clearSynced(): Promise<QueueItem[]> {
  const items = (await readQueue()).filter((i) => i.status !== 'synced')
  await writeQueue(items)
  return items
}

export async function removeItem(key: string): Promise<QueueItem[]> {
  const items = (await readQueue()).filter((i) => i.client_dedup_key !== key)
  await writeQueue(items)
  return items
}

// Replay all pending items to the server. Returns the updated queue.
export async function syncQueue(): Promise<QueueItem[]> {
  let items = await readQueue()
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'error')
  if (pending.length === 0) return items

  const res = await fetch('/api/attendance/offline-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: pending.map((p) => ({
        client_dedup_key: p.client_dedup_key,
        session_id: p.session_id,
        latitude: p.latitude,
        longitude: p.longitude,
        location_accuracy: p.location_accuracy,
        device_fingerprint: p.device_fingerprint,
        captured_at: p.captured_at,
      })),
    }),
  })

  if (!res.ok) {
    // Leave items pending; will retry on next connectivity event.
    return items
  }

  const json = await res.json()
  const results: Array<{ client_dedup_key: string; status: string; reason?: string }> = json.data?.results || []
  const byKey = new Map(results.map((r) => [r.client_dedup_key, r]))

  items = items.map((i) => {
    const r = byKey.get(i.client_dedup_key)
    if (!r) return i
    if (r.status === 'synced' || r.status === 'duplicate') return { ...i, status: 'synced' as const }
    if (r.status === 'rejected') return { ...i, status: 'rejected' as const, reason: r.reason }
    return { ...i, status: 'error' as const, reason: r.reason }
  })

  await writeQueue(items)
  return items
}

export function newDedupKey(sessionId: string): string {
  return `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}
