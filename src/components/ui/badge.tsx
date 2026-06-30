import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm transition-colors",
  {
    variants: {
      variant: {
        default: "bg-indigo-100/80 text-indigo-700 border border-indigo-200/50",
        secondary: "bg-white/50 text-gray-700 border border-white/30",
        success: "bg-emerald-100/80 text-emerald-700 border border-emerald-200/50",
        warning: "bg-amber-100/80 text-amber-700 border border-amber-200/50",
        destructive: "bg-red-100/80 text-red-700 border border-red-200/50",
        outline: "bg-white/30 border border-white/40 text-gray-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
