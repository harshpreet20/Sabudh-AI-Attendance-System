'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import './electric-border.css'

interface ElectricBorderProps {
  children: React.ReactNode
  borderWidth?: number
  borderRadius?: number
  duration?: number
  className?: string
}

export function ElectricBorder({
  children,
  borderWidth = 2,
  borderRadius = 16,
  duration = 5,
  className = '',
}: ElectricBorderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { offsetWidth, offsetHeight } = containerRef.current
      setDimensions({ width: offsetWidth, height: offsetHeight })
    }
  }, [])

  useEffect(() => {
    updateDimensions()
    const observer = new ResizeObserver(updateDimensions)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [updateDimensions])

  const { width, height } = dimensions
  const perimeter = 2 * (width + height)
  const dashLength = perimeter / 4

  return (
    <div
      ref={containerRef}
      className={`electric-border-container ${className}`}
      style={{ borderRadius }}
    >
      {width > 0 && height > 0 && (
        <svg
          className="electric-border-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            className="electric-border-rect"
            x={borderWidth / 2}
            y={borderWidth / 2}
            width={width - borderWidth}
            height={height - borderWidth}
            rx={borderRadius}
            ry={borderRadius}
            strokeWidth={borderWidth}
            strokeDasharray={`${dashLength} ${perimeter - dashLength}`}
            style={{
              ['--perimeter' as string]: perimeter,
              animationDuration: `${duration}s`,
            }}
          />
        </svg>
      )}
      <div className="electric-border-content">{children}</div>
    </div>
  )
}
