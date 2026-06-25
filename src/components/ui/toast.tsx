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
            "bg-white border border-gray-200 shadow-lg rounded-xl text-sm text-gray-900",
          title: "font-semibold",
          description: "text-gray-500",
          success: "border-green-200 bg-green-50 text-green-900",
          error: "border-red-200 bg-red-50 text-red-900",
          warning: "border-amber-200 bg-amber-50 text-amber-900",
          info: "border-blue-200 bg-blue-50 text-blue-900",
        },
      }}
      richColors
      closeButton
    />
  )
}

export { Toaster, toast }
