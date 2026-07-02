'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  CheckSquare,
  BookOpen,
  ClipboardList,
  MessageSquare,
  User,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Award,
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
    icon: Sparkles,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Welcome to Sabudh AI!',
    description:
      'Your all-in-one platform for Gen AI, coding, and data science learning. Let us walk you through the key features so you can hit the ground running.',
    tip: 'This tour only shows once. You can always explore the sidebar to find any feature.',
  },
  {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Your Dashboard',
    description:
      'The dashboard is your home base. It shows your attendance stats, upcoming sessions, certificate progress, and recent activity at a glance.',
    tip: 'Check your dashboard daily to stay on top of announcements and session schedules.',
  },
  {
    icon: CheckSquare,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Attendance',
    description:
      'When your teacher opens a session, head to "Attendance" to mark your presence. You\'ll enter a verification word provided by your instructor.',
    tip: 'Maintain at least 75% attendance to earn your certificate.',
  },
  {
    icon: BookOpen,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Curriculum',
    description:
      'Access course materials like PDFs, slides, and documents uploaded by your teacher. Track your progress as you work through each resource.',
    tip: 'Mark materials as "Complete" to track your learning journey.',
  },
  {
    icon: ClipboardList,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Assignments',
    description:
      'View and submit assignments from your teacher. Upload files, write responses, and receive grades and feedback directly on the platform.',
    tip: 'Submit before the deadline — late submissions may not be accepted.',
  },
  {
    icon: MessageSquare,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Discussions & Q&A',
    description:
      'Ask course-related questions, share insights, and learn from your peers. Teachers and moderators can mark the best answers.',
    tip: 'Use topics to categorize your questions for faster responses.',
  },
  {
    icon: User,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Your Profile',
    description:
      'Keep your profile photo and personal details updated. Your photo is used for face verification during attendance.',
    tip: 'A clear, recent face photo helps ensure smooth attendance verification.',
  },
  {
    icon: Award,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'You\'re All Set!',
    description:
      'You\'re ready to start your learning journey. Explore the sidebar to discover all features including schedules, leave applications, projects, and more.',
    tip: 'Have a question? Use the AI chatbot in the bottom-right corner anytime.',
  },
]

interface OnboardingTourProps {
  studentProfileId: string
}

export function OnboardingTour({ studentProfileId }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const [completing, setCompleting] = useState(false)

  const markComplete = useCallback(async () => {
    setCompleting(true)
    const supabase = createClient()
    await supabase
      .from('student_profiles')
      .update({ onboarding_completed: true })
      .eq('id', studentProfileId)
    setVisible(false)
  }, [studentProfileId])

  async function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      await markComplete()
    }
  }

  function handlePrev() {
    if (step > 0) setStep((s) => s - 1)
  }

  async function handleSkip() {
    await markComplete()
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleSkip}
      />

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
                  i === step
                    ? 'w-6 bg-indigo-500'
                    : i < step
                      ? 'w-1.5 bg-indigo-300'
                      : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className={`inline-flex rounded-2xl ${current.iconBg} p-4 mb-5`}>
            <Icon className={`h-8 w-8 ${current.iconColor}`} />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {current.description}
          </p>

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
            <Button
              size="sm"
              onClick={handleNext}
              loading={completing}
            >
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
