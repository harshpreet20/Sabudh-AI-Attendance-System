"use client"

import { Toaster as SonnerToaster } from "sonner"
import { toast } from "sonner"

function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "glass-strong !rounded-2xl shadow-spatial text-sm text-gray-900",
          title: "font-semibold",
          description: "text-gray-500",
          success: "!bg-emerald-50/80 !border-emerald-200/50 text-emerald-900",
          error: "!bg-red-50/80 !border-red-200/50 text-red-900",
          warning: "!bg-amber-50/80 !border-amber-200/50 text-amber-900",
          info: "!bg-indigo-50/80 !border-indigo-200/50 text-indigo-900",
        },
      }}
      richColors
      closeButton
    />
  )
}

export { Toaster, toast }
