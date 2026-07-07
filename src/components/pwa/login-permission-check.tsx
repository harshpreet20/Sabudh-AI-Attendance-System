'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Camera, Check, X, ShieldCheck } from 'lucide-react'
import { VAPID_PUBLIC_KEY } from '@/lib/pwa'
import { enablePushNotifications, enableCameraAccess } from '@/lib/push-client'
import { toast } from 'sonner'

const SESSION_KEY = 'sabudh_perm_prompted_v1'
const CAMERA_OK_KEY = 'sabudh_camera_ok'

interface LoginPermissionCheckProps {
  /** Hold the prompt back while another intro (e.g. the onboarding tour) is up. */
  disabled?: boolean
}

/**
 * On each login, verifies push-notification and camera permissions and prompts
 * the student to enable whatever is missing. Shows nothing when both are
 * already granted; only nags once per browser session.
 */
export function LoginPermissionCheck({ disabled = false }: LoginPermissionCheckProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pushApplicable, setPushApplicable] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  const [cameraGranted, setCameraGranted] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (disabled) return
    let cancelled = false

    async function check() {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return
      } catch {
        return
      }

      const canPush =
        Boolean(VAPID_PUBLIC_KEY) &&
        typeof Notification !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window
      const pushOk = !canPush || Notification.permission === 'granted'

      let cameraOk = false
      try {
        cameraOk = localStorage.getItem(CAMERA_OK_KEY) === '1'
      } catch {
        /* storage unavailable */
      }
      if (!cameraOk && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({
            name: 'camera',
          } as unknown as PermissionDescriptor)
          if (status.state === 'granted') {
            cameraOk = true
            try {
              localStorage.setItem(CAMERA_OK_KEY, '1')
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* Permissions API doesn't support 'camera' (e.g. Safari) */
        }
      }

      if (cancelled) return
      setPushApplicable(canPush)
      setPushGranted(pushOk)
      setCameraGranted(cameraOk)

      if (pushOk && cameraOk) {
        try {
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          /* ignore */
        }
      } else {
        setVisible(true)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [disabled])

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [])

  async function handleEnablePush() {
    setPushBusy(true)
    const ok = await enablePushNotifications()
    setPushBusy(false)
    if (ok) {
      setPushGranted(true)
      toast.success('Notifications enabled.')
    } else {
      toast.error('Notification permission was not granted.')
    }
  }

  async function handleEnableCamera() {
    setCameraBusy(true)
    const ok = await enableCameraAccess()
    setCameraBusy(false)
    if (ok) {
      setCameraGranted(true)
      try {
        localStorage.setItem(CAMERA_OK_KEY, '1')
      } catch {
        /* ignore */
      }
      toast.success('Camera access enabled.')
    } else {
      toast.error('Camera permission was not granted.')
    }
  }

  // Close automatically once everything needed has been granted.
  useEffect(() => {
    if (!visible) return
    const pushOk = !pushApplicable || pushGranted
    if (pushOk && cameraGranted) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* ignore */
      }
      const t = setTimeout(() => setVisible(false), 900)
      return () => clearTimeout(t)
    }
  }, [visible, pushApplicable, pushGranted, cameraGranted])

  if (!mounted || !visible) return null

  const rows = [
    pushApplicable && {
      key: 'push',
      icon: Bell,
      title: 'Notifications',
      desc: 'Get alerts for attendance windows, announcements, and results.',
      granted: pushGranted,
      busy: pushBusy,
      onEnable: handleEnablePush,
    },
    {
      key: 'camera',
      icon: Camera,
      title: 'Camera',
      desc: 'Required for AI-based attendance verification.',
      granted: cameraGranted,
      busy: cameraBusy,
      onEnable: handleEnableCamera,
    },
  ].filter(Boolean) as Array<{
    key: string
    icon: typeof Bell
    title: string
    desc: string
    granted: boolean
    busy: boolean
    onEnable: () => void
  }>

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          <div className="mb-4 inline-flex rounded-2xl bg-indigo-100 p-3">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <h3 className="text-base font-bold text-gray-900">
            Enable permissions
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            These are needed to mark your attendance and stay up to date.
          </p>

          <div className="mt-4 space-y-2.5">
            {rows.map((row) => {
              const Icon = row.icon
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
                >
                  <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-2">
                    <Icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {row.title}
                    </p>
                    <p className="text-xs text-gray-500">{row.desc}</p>
                  </div>
                  {row.granted ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-600">
                      <Check className="h-3.5 w-3.5" />
                      On
                    </span>
                  ) : (
                    <button
                      onClick={row.onEnable}
                      disabled={row.busy}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {row.busy ? 'Enabling…' : 'Enable'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={dismiss}
              className="text-xs font-medium text-gray-400 hover:text-gray-600"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
