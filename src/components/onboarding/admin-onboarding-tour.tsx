'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { adminOnboardingKey } from '@/lib/onboarding'
import {
  ShieldCheck,
  LayoutDashboard,
  Sparkles,
  Flame,
  ShieldAlert,
  Copy,
  Bell,
  Upload,
  Users,
  ChevronRight,
  ChevronLeft,
  X,
  History,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface OnboardingStep {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  description: string
  tip: string
}

const STEPS: OnboardingStep[] = [
  {
    icon: ShieldCheck,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Welcome to the Admin Console',
    description:
      'This is your control center for the whole programme — people, classes, analytics and platform settings. Here\'s a quick tour of what you can do, including the newest tools.',
    tip: 'This tour only shows once per update. You can always explore the sidebar to find any feature.',
  },
  {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Overview Dashboard',
    description:
      'The overview shows organisation-wide attendance stats, recent activity, engagement charts and — now — an At-Risk Students widget so problems surface immediately.',
    tip: 'Start your day here to catch anything that needs attention across all batches.',
  },
  {
    icon: ShieldAlert,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    title: 'New: At-Risk Students',
    description:
      'The dashboard widget ranks students by AI-predicted risk of falling below the attendance threshold, showing current vs projected percentages and consecutive absences. Use the one-click "Notify" button to send a low-attendance warning instantly.',
    tip: 'Act on Critical and High risk students early — the projection tells you if a shortfall is still recoverable.',
  },
  {
    icon: Sparkles,
    iconColor: 'text-fuchsia-600',
    iconBg: 'bg-fuchsia-100',
    title: 'New: AI Insights & Heatmaps',
    description:
      'The AI Insights page (Dashboard → AI Insights) gives you an executive summary plus attendance heatmaps by day, time-slot, week, month, subject and faculty — and highlights the most absent students and most punctual classes.',
    tip: 'Use the heatmaps to spot patterns — a consistently weak time-slot or subject often points to a scheduling fix.',
  },
  {
    icon: Copy,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'New: Duplicate & Fraud Review',
    description:
      'Under AI Insights → Duplicate Flags, review attendance the system flagged as suspicious — shared devices, impossible location jumps or spoofed GPS. Confirm to send it to manual review, or dismiss false positives.',
    tip: 'Confirmed flags automatically move that attendance record into manual review for correction.',
  },
  {
    icon: Upload,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    title: 'New: Bulk Upload',
    description:
      'Onboard faculty and subjects in bulk from CSV/Excel (People → Bulk Upload). Validate first to catch errors and in-file duplicates, then import — valid rows still import even if a few rows fail.',
    tip: 'Always run "Validate" first; it previews exactly what will be created before you commit.',
  },
  {
    icon: Bell,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-100',
    title: 'New: Instant Notifications',
    description:
      'Students and staff now receive instant in-app and push notifications for attendance events, cancellations, schedule changes and low-attendance warnings — no SMS required.',
    tip: 'Encourage users to enable browser notifications so time-sensitive alerts reach them immediately.',
  },
  {
    icon: Users,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'People, Classes & Settings',
    description:
      'Manage students, users, approvals, sessions, campuses, courses and certificates from the sidebar. Campus geofencing and attendance thresholds are configured here too.',
    tip: 'Keep campus coordinates and geofence radius accurate — attendance verification depends on them.',
  },
  {
    icon: History,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'New: Previous Class Workspace',
    description:
      'Every completed class now has an interactive workspace under "Previous Classes" — a secure material viewer, an AI Team, AI summary, key takeaways, a self-grading quiz, a collaborative whiteboard, and teacher notes. When staff upload a file, the system suggests the right lecture and auto-converts PowerPoint/Word to a secure interactive format.',
    tip: 'You can open any batch\'s lectures the same way instructors do — useful for spot-checking material quality.',
  },
  {
    icon: ShieldCheck,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: "You're All Set!",
    description:
      'That\'s the tour. Explore the sidebar to dive into any area. The new analytics, risk detection and integrity tools are there to help you run a tighter, fairer programme.',
    tip: 'Have a question? Use the AI chatbot in the bottom-right corner anytime for help.',
  },
]

export function AdminOnboardingTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const storageKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      // Versioned key: bumping the tutorial version re-shows the tour once.
      const key = adminOnboardingKey(user.id)
      storageKeyRef.current = key
      try {
        if (!localStorage.getItem(key)) {
          setVisible(true)
        }
      } catch {
        // localStorage unavailable
      }
    })
  }, [])

  const markComplete = useCallback(() => {
    setCompleting(true)
    try {
      if (storageKeyRef.current) {
        localStorage.setItem(storageKeyRef.current, 'true')
      }
    } catch {
      // localStorage unavailable, silently continue
    }
    setVisible(false)
    setCompleting(false)
  }, [])

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      markComplete()
    }
  }

  function handlePrev() {
    if (step > 0) setStep((s) => s - 1)
  }

  function handleSkip() {
    markComplete()
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleSkip} />

      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Skip button */}
        {!isLast && (
          <button
            onClick={handleSkip}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors z-10"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Content */}
        <div className="px-8 pt-8 pb-6">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-indigo-500' : i < step ? 'w-1.5 bg-indigo-300' : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className={`inline-flex rounded-2xl ${current.iconBg} p-4 mb-5`}>
            <Icon className={`h-8 w-8 ${current.iconColor}`} />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-3">{current.title}</h2>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{current.description}</p>

          {/* Tip */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Tip: </span>
              {current.tip}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-8 py-4 bg-gray-50/50">
          <div className="text-xs text-gray-400">
            {step + 1} of {STEPS.length}
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext} loading={completing}>
              {isLast ? (
                'Get Started'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
