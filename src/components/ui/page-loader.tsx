/**
 * Lazy-loading fallback shown while a route segment streams in. Rendered inside
 * the dashboard shell (via each segment's loading.tsx), so the sidebar stays put
 * and only the content area shows the loader.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-gray-500"
      role="status"
      aria-live="polite"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
      <p className="text-sm font-medium">{label}</p>
      <span className="sr-only">Loading</span>
    </div>
  )
}
