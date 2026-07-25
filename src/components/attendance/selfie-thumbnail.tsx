'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SelfieThumbnailProps {
  path: string | null | undefined
}

// Small round thumbnail of a verified class selfie; click opens a full-size
// lightbox. Renders nothing when there's no selfie to show.
export function SelfieThumbnail({ path }: SelfieThumbnailProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!path) return null

  const supabase = createClient()
  const { data } = supabase.storage.from('uploads').getPublicUrl(path)
  const url = data.publicUrl

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View class selfie"
        className="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 transition hover:ring-2 hover:ring-indigo-300"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Class selfie" className="h-full w-full object-cover" />
      </button>

      {open && mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-6"
            onClick={() => setOpen(false)}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-5 top-5 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Class selfie"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  )
}
