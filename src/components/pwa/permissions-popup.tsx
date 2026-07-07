'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Camera, MapPin, Bell, Check, X, ShieldCheck, ChevronDown, HelpCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { VAPID_PUBLIC_KEY } from '@/lib/pwa'
import { enablePushNotifications } from '@/lib/push-client'
import {
  checkPermission,
  requestPermission,
  getEnableGuidance,
  type PermissionState,
} from '@/lib/permissions'
import { toast } from 'sonner'

// Utility/transactional routes where a permission popup would be intrusive.
const HIDDEN_PREFIXES = [
  '/auth',
  '/verify-certificate',
  '/reset-password',
  '/forgot-password',
  '/pending-approval',
]

const FLAG: Record<'camera' | 'location', string> = {
  camera: 'sabudh_camera_ok',
  location: 'sabudh_location_ok',
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
}

/** granted, or unknown-but-previously-granted, or unsupported (can't act on it). */
function isSatisfied(state: PermissionState, flagged: boolean): boolean {
  if (state === 'granted' || state === 'unsupported') return true
  if (state === 'prompt') return flagged
  return false
}

type Phase = 'permissions' | 'notifications'

/**
 * Universal, compulsory permission popup shown whenever the site is opened.
 * Step 1 requests Camera + Location (required for attendance); step 2 requests
 * Notifications. Each "Allow" triggers the native OS/browser prompt in one
 * click; when a permission is blocked it shows platform-specific steps to
 * re-enable it. Reappears on every visit until the required permissions are
 * granted.
 */
export function PermissionsPopup() {
  const pathname = usePathname()
  const hidden = HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState<Phase>('permissions')
  const [camera, setCamera] = useState<PermissionState>('prompt')
  const [location, setLocation] = useState<PermissionState>('prompt')
  const [push, setPush] = useState<PermissionState>('unsupported')
  const [canPush, setCanPush] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [guide, setGuide] = useState<'camera' | 'location' | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (hidden) return
    let cancelled = false

    async function check() {
      const [cam, loc] = await Promise.all([
        checkPermission('camera'),
        checkPermission('location'),
      ])

      const pushSupported =
        Boolean(VAPID_PUBLIC_KEY) &&
        typeof Notification !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window
      const pushState: PermissionState = !pushSupported
        ? 'unsupported'
        : Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
            ? 'denied'
            : 'prompt'

      if (cancelled) return
      setCamera(cam)
      setLocation(loc)
      setCanPush(pushSupported)
      setPush(pushState)

      const camOk = isSatisfied(cam, readFlag(FLAG.camera))
      const locOk = isSatisfied(loc, readFlag(FLAG.location))
      const pushPending = pushSupported && pushState === 'prompt'

      if (!camOk || !locOk) {
        setPhase('permissions')
        setVisible(true)
      } else if (pushPending) {
        setPhase('notifications')
        setVisible(true)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [hidden])

  const close = useCallback(() => setVisible(false), [])

  async function handleRequest(kind: 'camera' | 'location') {
    setBusy(kind)
    const result = await requestPermission(kind)
    setBusy(null)
    ;(kind === 'camera' ? setCamera : setLocation)(result)
    const label = kind === 'camera' ? 'Camera' : 'Location'
    if (result === 'granted') {
      writeFlag(FLAG[kind])
      setGuide((g) => (g === kind ? null : g))
      toast.success(`${label} enabled.`)
    } else if (result === 'denied') {
      setGuide(kind)
      toast.error(`${label} is blocked — follow the steps to turn it on.`)
    } else if (result === 'unsupported') {
      toast.error(`${label} isn't available on this device.`)
    } else {
      toast.message(`Choose "Allow" in the prompt to enable ${label}.`)
    }
  }

  async function handlePush() {
    setBusy('push')
    const result = await enablePushNotifications()
    setBusy(null)
    if (result === 'granted') {
      setPush('granted')
      toast.success('Notifications enabled.')
    } else if (result === 'denied') {
      setPush(
        typeof Notification !== 'undefined' && Notification.permission === 'denied'
          ? 'denied'
          : 'prompt'
      )
      toast.error('Notifications are blocked. You can turn them on in your browser settings.')
    } else if (result === 'error') {
      toast.error('Could not turn on notifications. Please try again.')
    } else {
      toast.error('Notifications aren’t available on this device.')
    }
  }

  const camOk = isSatisfied(camera, readFlag(FLAG.camera))
  const locOk = isSatisfied(location, readFlag(FLAG.location))

  // Advance from permissions → notifications (or finish) once camera + location
  // are satisfied. Deferred via timeout so the "On" state is briefly visible.
  useEffect(() => {
    if (!visible || phase !== 'permissions' || !camOk || !locOk) return
    const t = setTimeout(() => {
      if (canPush && push === 'prompt') {
        setPhase('notifications')
      } else {
        setVisible(false)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [visible, phase, camOk, locOk, canPush, push])

  // Close the notifications step once granted.
  useEffect(() => {
    if (!visible || phase !== 'notifications' || push !== 'granted') return
    const t = setTimeout(() => setVisible(false), 700)
    return () => clearTimeout(t)
  }, [visible, phase, push])

  if (!mounted || hidden || !visible) return null

  interface Row {
    kind: 'camera' | 'location' | 'push'
    icon: LucideIcon
    title: string
    desc: string
    state: PermissionState
  }

  const permissionRows: Row[] = [
    {
      kind: 'camera' as const,
      icon: Camera,
      title: 'Camera',
      desc: 'Used to check your face when you mark attendance.',
      state: camera,
    },
    {
      kind: 'location' as const,
      icon: MapPin,
      title: 'Location',
      desc: 'Used to check that you are in class.',
      state: location,
    },
  ].filter((r) => r.state !== 'unsupported')

  const rows: Row[] =
    phase === 'permissions'
      ? permissionRows
      : [
          {
            kind: 'push',
            icon: Bell,
            title: 'Notifications',
            desc: 'Get reminders for attendance, announcements, and results.',
            state: push,
          },
        ]

  const step = phase === 'permissions' ? 1 : 2
  const totalSteps = canPush ? 2 : 1

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto overflow-x-hidden rounded-[20px] bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        <button
          onClick={close}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {totalSteps > 1 && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
              Step {step} of {totalSteps}
            </p>
          )}
          <div className="mb-4 inline-flex rounded-2xl bg-indigo-100 p-3">
            {phase === 'permissions' ? (
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
            ) : (
              <Bell className="h-6 w-6 text-indigo-600" />
            )}
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {phase === 'permissions' ? 'Allow camera & location' : 'Turn on notifications'}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {phase === 'permissions'
              ? 'You need these to mark your attendance. Tap “Allow” for each one.'
              : 'Get reminders even when the app is closed. Tap “Allow”.'}
          </p>

          <div className="mt-4 space-y-2.5">
            {rows.map((row) => {
              const Icon = row.icon
              const flagged =
                row.kind !== 'push' && readFlag(FLAG[row.kind as 'camera' | 'location'])
              const granted = row.state === 'granted' || flagged
              const denied = row.state === 'denied'
              const isBusy = busy === row.kind
              const guidance =
                row.kind !== 'push' && guide === row.kind
                  ? getEnableGuidance(row.kind as 'camera' | 'location')
                  : null

              return (
                <div key={row.kind} className="rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-3 p-3">
                    <div className="inline-flex shrink-0 rounded-xl bg-gray-100 p-2">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{row.title}</p>
                      <p className="text-xs text-gray-500">{row.desc}</p>
                    </div>

                    {granted ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-600">
                        <Check className="h-3.5 w-3.5" />
                        On
                      </span>
                    ) : denied && row.kind !== 'push' ? (
                      <button
                        onClick={() =>
                          setGuide((g) =>
                            g === row.kind ? null : (row.kind as 'camera' | 'location')
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Enable
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            guide === row.kind ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          row.kind === 'push'
                            ? handlePush()
                            : handleRequest(row.kind as 'camera' | 'location')
                        }
                        disabled={isBusy}
                        className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isBusy ? 'Wait…' : 'Allow'}
                      </button>
                    )}
                  </div>

                  {guidance && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-3">
                      <p className="mb-1.5 text-[11px] font-semibold text-gray-500">
                        {guidance.platform}
                      </p>
                      <ol className="space-y-1.5">
                        {guidance.steps.map((s, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-600">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-600">
                              {i + 1}
                            </span>
                            {s}
                          </li>
                        ))}
                      </ol>
                      <button
                        onClick={() => handleRequest(row.kind as 'camera' | 'location')}
                        className="mt-2.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        I&apos;ve enabled it — try again
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {phase === 'notifications' && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={close}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                Maybe later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
