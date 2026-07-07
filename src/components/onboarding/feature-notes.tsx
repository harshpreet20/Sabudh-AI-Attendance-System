'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  CheckSquare,
  History,
  Award,
  Bell,
  User,
  Settings,
  Users,
  Calendar,
  Building2,
  BarChart3,
  FileText,
  Upload,
  Megaphone,
  ClipboardList,
  GraduationCap,
  CalendarOff,
  ShieldCheck,
  FolderKanban,
  TrendingUp,
  UserPlus,
  MessageSquare,
  Bot,
  MapPin,
  BookOpen,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureNote {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  note: string
}

/**
 * A one-time contextual micro-note shown the first time a user lands on each
 * feature. Keyed by route so every feature gets its own short introduction.
 * The most specific matching key wins (longest prefix), so detail pages inherit
 * their parent feature's note.
 */
const FEATURE_NOTES: Record<string, FeatureNote> = {
  // ---- Student ----
  '/dashboard': {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Your Dashboard',
    note: 'Your home base — attendance stats, upcoming sessions, certificate progress, and recent activity at a glance.',
  },
  '/dashboard/attendance': {
    icon: CheckSquare,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Mark Attendance',
    note: 'When your teacher opens a session, mark your presence here. Allow camera and location — they are required for AI verification.',
  },
  '/dashboard/leave': {
    icon: CalendarOff,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    title: 'Leave Applications',
    note: 'Apply for leave and track approval status. Documented leave can protect your attendance percentage.',
  },
  '/dashboard/curriculum': {
    icon: BookOpen,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Curriculum',
    note: 'Course materials — PDFs, slides, and docs. Mark items complete to track your learning progress.',
  },
  '/dashboard/assignments': {
    icon: ClipboardList,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Assignments',
    note: 'View and submit assignments, then receive grades and feedback. Submit before the deadline — late work may not be accepted.',
  },
  '/dashboard/projects': {
    icon: FolderKanban,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Projects',
    note: 'Work on and submit your course projects. Project scores count toward your certificate.',
  },
  '/dashboard/history': {
    icon: History,
    iconColor: 'text-slate-600',
    iconBg: 'bg-slate-100',
    title: 'Attendance History',
    note: 'Your full attendance record, session by session. Aim to stay above the 80% requirement.',
  },
  '/dashboard/schedules': {
    icon: Calendar,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Schedules',
    note: 'Upcoming class sessions and timings. Attendance only opens during the designated class window.',
  },
  '/dashboard/journey': {
    icon: MapPin,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'My Journey',
    note: 'A visual timeline of your progress through the course — milestones, streaks, and achievements.',
  },
  '/dashboard/certificate': {
    icon: Award,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Certificate',
    note: 'Two requirements to earn it: at least 80% attendance AND 60% combined assignment + project score. See exactly where you stand.',
  },
  '/dashboard/discussions': {
    icon: MessageSquare,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Discussions & Q&A',
    note: 'Ask course-related questions and learn from your peers. Teachers mark the best answers.',
  },
  '/dashboard/announcements': {
    icon: Megaphone,
    iconColor: 'text-pink-600',
    iconBg: 'bg-pink-100',
    title: 'Announcements',
    note: 'Important updates from your instructors — schedule changes, deadlines, and news. Check regularly.',
  },
  '/dashboard/messages': {
    icon: MessageSquare,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Messages',
    note: 'Direct, private conversations with your faculty. Reach out here instead of sharing details publicly.',
  },
  '/dashboard/notifications': {
    icon: Bell,
    iconColor: 'text-yellow-600',
    iconBg: 'bg-yellow-100',
    title: 'Notifications',
    note: 'All your alerts in one place — new grades, announcements, session openings, and replies.',
  },
  '/dashboard/profile': {
    icon: User,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Your Profile',
    note: 'Keep your photo and details updated. Your photo is used for face verification during attendance.',
  },
  '/dashboard/settings': {
    icon: Settings,
    iconColor: 'text-gray-600',
    iconBg: 'bg-gray-100',
    title: 'Settings',
    note: 'Manage your account preferences, password, and notification options.',
  },

  // ---- Teacher ----
  '/teacher': {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Instructor Dashboard',
    note: "Your command center — today's sessions, attendance stats, and assignments waiting to be graded.",
  },
  '/teacher/students': {
    icon: GraduationCap,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Students',
    note: 'Manage your roster, approve enrollment requests, and review each student’s attendance and scores.',
  },
  '/teacher/attendance': {
    icon: CheckSquare,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Attendance',
    note: 'Review who was present, absent, or late per session. Grant grace attendance — and document the reason.',
  },
  '/teacher/leave': {
    icon: CalendarOff,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    title: 'Leave Requests',
    note: 'Review and approve or decline student leave applications.',
  },
  '/teacher/curriculum': {
    icon: BookOpen,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Curriculum',
    note: 'Upload and organize course materials. Keep them in a logical order so students can follow along.',
  },
  '/teacher/assignments': {
    icon: ClipboardList,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Assignments',
    note: 'Create assignments, grade submissions, and use AI-assisted assessment as a starting point — always review before finalizing.',
  },
  '/teacher/projects': {
    icon: FolderKanban,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Projects',
    note: 'Create projects, review submissions, and provide feedback with AI-assisted evaluation.',
  },
  '/teacher/progress': {
    icon: TrendingUp,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Progress Reviews',
    note: 'Track student milestones and identify who may need extra support.',
  },
  '/teacher/discussions': {
    icon: MessageSquare,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Discussions',
    note: 'Engage with students, answer questions, and mark the best responses.',
  },
  '/teacher/announcements': {
    icon: Megaphone,
    iconColor: 'text-pink-600',
    iconBg: 'bg-pink-100',
    title: 'Announcements',
    note: 'Post updates to keep students informed. Pin important ones so they stay visible.',
  },
  '/teacher/schedules': {
    icon: Calendar,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Schedules',
    note: 'Plan and manage class sessions and timings for your batches.',
  },
  '/teacher/messages': {
    icon: MessageSquare,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Messages',
    note: 'Direct, private conversations with your students and staff.',
  },
  '/teacher/profile': {
    icon: User,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Your Profile',
    note: 'Keep your instructor profile and contact details up to date.',
  },

  // ---- Admin ----
  '/admin': {
    icon: LayoutDashboard,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'Admin Dashboard',
    note: 'A platform-wide overview — enrollment, attendance, and engagement metrics at a glance.',
  },
  '/admin/analytics': {
    icon: BarChart3,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-100',
    title: 'Analytics',
    note: 'Deep-dive into engagement, attendance trends, and performance across batches.',
  },
  '/admin/audit-logs': {
    icon: FileText,
    iconColor: 'text-slate-600',
    iconBg: 'bg-slate-100',
    title: 'Audit Logs',
    note: 'A record of sensitive actions across the platform for accountability.',
  },
  '/admin/approvals': {
    icon: ShieldCheck,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Account Approvals',
    note: 'Review and approve or reject new account requests before users get access.',
  },
  '/admin/students': {
    icon: Users,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Students',
    note: 'The full student directory — search profiles and review individual records.',
  },
  '/admin/users': {
    icon: UserPlus,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Manage Users',
    note: 'Create and manage staff and user accounts and their roles.',
  },
  '/admin/import': {
    icon: Upload,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Import Students',
    note: 'Bulk-import students from a spreadsheet and send welcome emails automatically.',
  },
  '/admin/attendance': {
    icon: CheckSquare,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'Attendance',
    note: 'Cross-batch attendance oversight, with manual overrides when needed.',
  },
  '/admin/sessions': {
    icon: Calendar,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-100',
    title: 'Sessions',
    note: 'Manage every class session across all batches from one place.',
  },
  '/admin/leave': {
    icon: CalendarOff,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    title: 'Leave Requests',
    note: 'Oversee and act on leave requests platform-wide.',
  },
  '/admin/classrooms': {
    icon: Building2,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Classrooms',
    note: 'Configure classrooms and their geofences for location-based attendance.',
  },
  '/admin/campuses': {
    icon: MapPin,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
    title: 'Campuses',
    note: 'Manage campuses and locations that classrooms belong to.',
  },
  '/admin/curriculum': {
    icon: GraduationCap,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Curriculum',
    note: 'Curate and organize curriculum across all courses.',
  },
  '/admin/courses': {
    icon: BookOpen,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Courses & Batches',
    note: 'Create and manage courses and the batches running under them.',
  },
  '/admin/certificates': {
    icon: Award,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    title: 'Certificates',
    note: 'Issue, verify, and track completion certificates.',
  },
  '/admin/discussions': {
    icon: MessageSquare,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-100',
    title: 'Discussions',
    note: 'Moderate community discussions across the platform.',
  },
  '/admin/announcements': {
    icon: Megaphone,
    iconColor: 'text-pink-600',
    iconBg: 'bg-pink-100',
    title: 'Announcements',
    note: 'Broadcast announcements to students and staff platform-wide.',
  },
  '/admin/knowledge-base': {
    icon: Bot,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    title: 'Knowledge Base',
    note: 'Train the AI chatbot by curating the knowledge it answers from.',
  },
  '/admin/messages': {
    icon: MessageSquare,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Messages',
    note: 'Direct, private conversations with students and staff.',
  },
  '/admin/settings': {
    icon: Settings,
    iconColor: 'text-gray-600',
    iconBg: 'bg-gray-100',
    title: 'Settings',
    note: 'Global platform configuration and defaults.',
  },
}

interface WelcomeItem {
  emoji: string
  title: string
  desc: string
}

// The essentials, shown as the first popup after a student logs in.
const WELCOME_ITEMS: WelcomeItem[] = [
  {
    emoji: '⏰',
    title: 'Complete your profile before the next class.',
    desc: 'Students with incomplete profiles may not be able to mark their attendance.',
  },
  {
    emoji: '📧',
    title: 'Log in with your registration email.',
    desc: 'Always use the same email address you used during registration.',
  },
  {
    emoji: '📱',
    title: 'Allow Camera and Location when prompted.',
    desc: 'These permissions are mandatory for AI-based attendance verification.',
  },
  {
    emoji: '📲',
    title: 'Bring your phone to every class.',
    desc: 'Attendance is marked through the Sabudh AI Attendance System.',
  },
  {
    emoji: '🌐',
    title: 'Add the web app to your home screen.',
    desc: 'The platform is fully optimized for mobile and works like a native app — nothing to install from an app store.',
  },
  {
    emoji: '⏱️',
    title: 'Attendance opens only during class timings.',
    desc: 'Late attendance requests may not be accepted.',
  },
  {
    emoji: '✅',
    title: 'Profile setup is a one-time process.',
    desc: "Once done, you'll simply log in and mark attendance for every class.",
  },
  {
    emoji: '🚀',
    title: 'Your dashboard is your single source of truth.',
    desc: 'Attendance, curriculum, resources, announcements, assignments, session updates, certificate status, and faculty communication — all in one place.',
  },
  {
    emoji: '🔒',
    title: 'Your data is handled securely.',
    desc: 'Face data and personal info are used only for attendance verification and course administration.',
  },
  {
    emoji: '❓',
    title: 'Need help logging in or setting up?',
    desc: 'DM an admin — never share personal info or login credentials in the WhatsApp group.',
  },
]

const STORAGE_PREFIX = 'sabudh_feat_'
const WELCOME_KEY = 'welcome'
const OFF_KEY = 'off'

/** Resolve the current route to its note using the longest matching key. */
function resolveNoteKey(pathname: string): string | null {
  let match: string | null = null
  for (const key of Object.keys(FEATURE_NOTES)) {
    if (pathname === key || pathname.startsWith(`${key}/`)) {
      if (!match || key.length > match.length) match = key
    }
  }
  return match
}

interface FeatureNotesProps {
  role: 'student' | 'teacher' | 'admin'
  currentPath: string
  /** Suppress the welcome popup while the full-screen onboarding tour is active. */
  suppressWelcome?: boolean
}

export function FeatureNotes({
  role,
  currentPath,
  suppressWelcome = false,
}: FeatureNotesProps) {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  // Notes dismissed this render cycle, layered on top of localStorage so the UI
  // updates immediately without a setState-in-effect.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  const storageKey = useCallback(
    (suffix: string) => `${STORAGE_PREFIX}${userId ?? 'anon'}_${suffix}`,
    [userId]
  )

  const isSeen = useCallback(
    (suffix: string) => {
      if (dismissed.has(suffix)) return true
      try {
        return localStorage.getItem(storageKey(suffix)) === '1'
      } catch {
        return true // treat unavailable storage as "already seen" so we stay quiet
      }
    },
    [dismissed, storageKey]
  )

  const remember = useCallback(
    (suffix: string) => {
      try {
        localStorage.setItem(storageKey(suffix), '1')
      } catch {
        // storage unavailable — nothing to persist
      }
    },
    [storageKey]
  )

  // Resolve the signed-in user once so note history is namespaced per account.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      setReady(true)
    })
  }, [])

  // Derive which note (if any) to show for the current route. Students get the
  // essentials popup first; contextual notes are held until it's been seen so
  // the two never appear at once.
  const activeKey = useMemo(() => {
    if (!ready || isSeen(OFF_KEY)) return null
    if (role === 'student' && !isSeen(WELCOME_KEY)) {
      return suppressWelcome ? null : WELCOME_KEY
    }
    const noteKey = resolveNoteKey(currentPath)
    return noteKey && !isSeen(noteKey) ? noteKey : null
  }, [ready, role, currentPath, suppressWelcome, isSeen])

  const dismiss = useCallback(() => {
    if (!activeKey) return
    remember(activeKey)
    setDismissed((prev) => new Set(prev).add(activeKey))
  }, [activeKey, remember])

  const turnOff = useCallback(() => {
    remember(OFF_KEY)
    if (activeKey) remember(activeKey)
    setDismissed((prev) => {
      const next = new Set(prev).add(OFF_KEY)
      if (activeKey) next.add(activeKey)
      return next
    })
  }, [activeKey, remember])

  if (!activeKey) return null

  // Welcome: a centered modal listing the getting-started essentials.
  if (activeKey === WELCOME_KEY) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={dismiss}
        />

        <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />

          <button
            onClick={dismiss}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pt-7 pb-4 sm:px-8">
            <div className="mb-4 inline-flex rounded-2xl bg-indigo-100 p-3">
              <Sparkles className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Before you begin
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              A few essentials to get the most out of the Sabudh AI Attendance System.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 sm:px-8">
            <ul className="space-y-3">
              {WELCOME_ITEMS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.title}
                    </p>
                    <p className="text-xs leading-relaxed text-gray-500">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50/50 sm:px-8">
            <button
              onClick={turnOff}
              className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              Don&apos;t show tips
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              Got it, let&apos;s go
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Feature note: a compact corner card introducing the current feature.
  const note = FEATURE_NOTES[activeKey]
  if (!note) return null

  const Icon = note.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-36 left-4 right-4 z-50 sm:bottom-6 sm:left-6 sm:right-auto sm:w-full sm:max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="relative rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />

        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Dismiss tip"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 pr-10">
          <div className="flex items-start gap-3">
            <div className={`inline-flex shrink-0 rounded-xl ${note.iconBg} p-2.5`}>
              <Icon className={`h-5 w-5 ${note.iconColor}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">
                  Quick tip
                </span>
              </div>
              <h3 className="mt-0.5 text-sm font-bold text-gray-900">
                {note.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                {note.note}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={turnOff}
              className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              Don&apos;t show tips
            </button>
            <button
              onClick={dismiss}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
