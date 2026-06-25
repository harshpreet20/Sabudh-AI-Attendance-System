"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface Tab {
  value: string
  label: string
}

export interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (value: string) => void
  className?: string
}

function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div
      className={cn("border-b border-gray-200", className)}
      role="tablist"
      aria-orientation="horizontal"
    >
      <nav className="-mb-px flex gap-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.value === activeTab
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.value}`}
              onClick={() => onChange(tab.value)}
              className={cn(
                "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  activeTab: string
}

function TabPanel({
  value,
  activeTab,
  children,
  className,
  ...props
}: TabPanelProps) {
  if (value !== activeTab) return null

  return (
    <div
      id={`tabpanel-${value}`}
      role="tabpanel"
      tabIndex={0}
      className={cn("mt-4 focus-visible:outline-none", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tabs, TabPanel }
