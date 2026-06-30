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
      className={cn("rounded-xl glass-subtle p-1", className)}
      role="tablist"
      aria-orientation="horizontal"
    >
      <nav className="flex gap-1" aria-label="Tabs">
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
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
                isActive
                  ? "bg-white/70 text-indigo-600 shadow-sm backdrop-blur-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/30"
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
