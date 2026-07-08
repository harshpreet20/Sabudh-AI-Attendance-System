'use client'

import { useState, useEffect, useCallback } from 'react'

export type BadgeCounts = Record<string, number>

export function useBadgeCounts(pollIntervalMs = 30000) {
  const [counts, setCounts] = useState<BadgeCounts>({})

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/badges')
      if (!res.ok) return
      const data = await res.json()
      setCounts(data.counts ?? {})
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, pollIntervalMs)
    // Refresh immediately when a realtime notification arrives.
    const onRefresh = () => fetchCounts()
    window.addEventListener('badges:refresh', onRefresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener('badges:refresh', onRefresh)
    }
  }, [fetchCounts, pollIntervalMs])

  return counts
}
