import * as React from "react"
import { cn } from "@/lib/utils"

const variantClasses = {
  default: "bg-indigo-500/80",
  success: "bg-emerald-500/80",
  warning: "bg-amber-500/80",
  danger: "bg-red-500/80",
} as const

const sizeClasses = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
} as const

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  variant?: keyof typeof variantClasses
  size?: keyof typeof sizeClasses
  showLabel?: boolean
}

function Progress({
  value,
  variant = "default",
  size = "md",
  showLabel = false,
  className,
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value))

  return (
    <div className={cn("w-full", className)} {...props}>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm font-medium text-gray-500">
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-white/40 backdrop-blur-sm",
          sizeClasses[size]
        )}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variantClasses[variant]
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  )
}

export { Progress }
