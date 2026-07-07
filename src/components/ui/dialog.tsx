"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [open])

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => {
      onClose()
    }

    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "fixed m-auto max-h-[85vh] w-[calc(100%-1.5rem)] max-w-lg overflow-hidden rounded-2xl p-0",
        "glass-strong shadow-spatial",
        "backdrop:bg-black/30 backdrop:backdrop-blur-md",
        "open:animate-in open:fade-in-0 open:zoom-in-95",
        className
      )}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      onClick={handleBackdropClick}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between p-6 pb-0">
          <div className="flex-1">
            {title && (
              <h2
                id={titleId}
                className="text-lg font-semibold text-gray-900"
              >
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-1 text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-xl p-1.5 text-gray-400 transition-all duration-200 hover:bg-white/60 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-white/20 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}

export { Dialog }
