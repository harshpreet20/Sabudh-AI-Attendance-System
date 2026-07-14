// Lightweight device-level cache for smooth revisits: paint the last-seen data
// instantly from localStorage, then revalidate in the background. Keys are
// namespaced by the signed-in user id (passed in by callers) so one account
// never reads another's cached data on a shared device.

const PREFIX = 'sabudh-cache-v1:'

export function cacheGet<T>(id: string, maxAgeMs = 1000 * 60 * 60 * 24): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    if (!raw) return null
    const obj = JSON.parse(raw) as { t: number; v: T }
    if (typeof obj.t !== 'number' || Date.now() - obj.t > maxAgeMs) return null
    return obj.v
  } catch {
    return null
  }
}

export function cacheSet<T>(id: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify({ t: Date.now(), v: value }))
  } catch {
    // storage full or unavailable — caching is best-effort
  }
}
