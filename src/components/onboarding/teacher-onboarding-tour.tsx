'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { teacherOnboardingKey } from '@/lib/onboarding'
import {
  LayoutDashboard,
  CalendarClock,
  ClipboardCheck,
  FileText,
  BookOpen,
  Users,
  MessageSquare,
  BarChart3,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  GraduationCap,
  QrCode,
  History,
  PenTool,
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
    icon: GraduationCap,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Welcome to the Instructor Portal',
    description:
      'This is your command center for managing courses, tracking student progress, and delivering an engaging learning experience. Let us walk you through everything you can do here.',
    tip: 'This tour only shows once. You can always explore the sidebar to find any feature.',
  },
  {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Your Dashboard',
    description:
      'The dashboard gives you a snapshot of your classes at a glance. See today\'s sessions, recent attendance stats, pending assignments to grade, and key announcements all in one place.',
    tip: 'Check your dashboard at the start of each day to stay on top of what needs your attention.',
  },
  {
    icon: CalendarClock,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-100',
    title: 'Sessions',
    description:
      'Create and manage class sessions from here. Open and close attendance windows, set verification words that students must enter to confirm their presence, and track session history.',
    tip: 'Set a unique verification word each session to prevent proxy attendance.',
  },
  {
    icon: ClipboardCheck,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Attendance',
    description:
      'Review detailed attendance records for each student. You can see who was present, absent, or late for every session. Grant grace attendance for students who had valid reasons for missing class.',
    tip: 'Use the grace attendance feature sparingly and document the reason for your records.',
  },
  {
    icon: QrCode,
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-100',
    title: 'New: Dynamic QR Attendance',
    description:
      'While an attendance window is open, start a live QR for the class. It refreshes every 15 seconds, so a photographed or forwarded code is useless within moments. Attendance is either/or — a student marks presence with the verification word OR by scanning this QR (GPS is verified either way). Keep the QR on screen for the whole window; Stop it anytime.',
    tip: 'Because the code rotates every 15s, you can leave it up for the full session without worrying about screenshots being shared.',
  },
  {
    icon: BarChart3,
    iconColor: 'text-fuchsia-600',
    iconBg: 'bg-fuchsia-100',
    title: 'New: Smarter Attendance Integrity',
    description:
      'Suspicious attempts — the same device used by two students, sudden location jumps or spoofed GPS — are now flagged automatically for admin review, so the attendance you see is more trustworthy.',
    tip: 'Consistently flagged students are worth a quick check-in — the system surfaces them for you.',
  },
  {
    icon: FileText,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Assignments & Projects',
    description:
      'Create assignments and projects with deadlines, rubrics, and instructions. Grade student submissions, provide detailed feedback, and leverage AI-powered assessment to help evaluate work efficiently.',
    tip: 'AI assessment gives you a starting point — always review and adjust grades before finalizing.',
  },
  {
    icon: BookOpen,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Curriculum',
    description:
      'Upload PDFs, slides, and documents for your batch. When you choose a file, the system suggests which lecture it belongs to so students find it in the right place — you can always override the "Lecture" dropdown before uploading. PowerPoint and Word files are auto-converted to a secure, interactive in-browser format.',
    tip: 'The AI lecture match is only a suggestion — the "Lecture" dropdown is always yours to change. Tie a file to a lecture and it appears in that lecture\'s workspace.',
  },
  {
    icon: History,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'New: Previous Class Workspace',
    description:
      'Every completed class becomes an interactive workspace under "Previous Classes". Each one gives you and your students a secure material viewer (no downloads), an AI Team you can ask questions, an AI summary, key takeaways, an auto-graded practice quiz, a collaborative whiteboard, and teacher & personal notes.',
    tip: 'Attach materials and add Teacher Notes to make each lecture a rich revision hub. Use "Manage materials" inside a lecture to attach files you already uploaded.',
  },
  {
    icon: PenTool,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'New: Collaborative Whiteboard',
    description:
      'Inside each lecture workspace is a live whiteboard for sticky notes, shapes, text and freehand drawing — synced in real time with everyone viewing it. Generate an AI mind map of the lecture in one click, and replay the whole board from start to finish.',
    tip: 'Use "Silent" to observe students working on the board without appearing in the participant list. Only staff can clear the board.',
  },
  {
    icon: Users,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Students',
    description:
      'Manage your student roster from here. Approve enrollment requests, view individual student profiles, and review their overall performance including attendance and assignment scores.',
    tip: 'Review student profiles regularly to identify those who may need additional support.',
  },
  {
    icon: MessageSquare,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Discussions & Announcements',
    description:
      'Post announcements to keep students informed about schedule changes, deadlines, and important updates. Use the discussion board to engage with students, answer questions, and foster collaboration.',
    tip: 'Pin important announcements so they stay visible at the top for all students.',
  },
  {
    icon: BarChart3,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Reports',
    description:
      'Access comprehensive reports on student progress, attendance trends, and assignment performance. Use these insights to adjust your teaching approach and identify students who may be falling behind.',
    tip: 'Export reports periodically to maintain records and share progress with stakeholders.',
  },
  {
    icon: Sparkles,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    title: "You're All Set!",
    description:
      "You're ready to start teaching. Explore the sidebar to discover all the tools at your disposal. Your students are counting on you — let's make this a great course!",
    tip: 'Have a question? Use the AI chatbot in the bottom-right corner anytime for help.',
  },
]

export function TeacherOnboardingTour() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const storageKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      // Versioned key: bumping the tutorial version re-shows the tour once.
      const key = teacherOnboardingKey(user.id)
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
