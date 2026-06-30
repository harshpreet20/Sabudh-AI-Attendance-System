import * as React from "react"
import { cn } from "@/lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: "line" | "circle" | "rect"
  width?: string | number
  height?: string | number
}

function Skeleton({
  shape = "line",
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "glass-shimmer rounded-2xl backdrop-blur-sm",
        shape === "line" && "h-4 w-full !rounded-lg",
        shape === "circle" && "h-10 w-10 !rounded-full",
        shape === "rect" && "h-24 w-full",
        className
      )}
      style={{
        ...(width ? { width: typeof width === "number" ? `${width}px` : width } : {}),
        ...(height ? { height: typeof height === "number" ? `${height}px` : height } : {}),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
