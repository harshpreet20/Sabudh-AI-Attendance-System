'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Share, Plus, X, Check } from 'lucide-react'
import { isIos, isStandalone } from '@/lib/pwa'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallAppButtonProps {
  className?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  fullWidth?: boolean
  label?: string
}

export function InstallAppButton({
  className,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  label = 'Install app',
}: InstallAppButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showIosSheet, setShowIosSheet] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Client-only capability checks; deferred to an effect to keep SSR output stable.
    setMounted(true)
    if (isStandalone()) setInstalled(true)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Avoid SSR/hydration mismatch — capability checks are client-only.
  if (!mounted || installed) return null

  const ios = isIos() && !isStandalone()
  const canPrompt = Boolean(deferred)

  // Nothing to offer in this browser (e.g. desktop Firefox with no prompt).
  if (!canPrompt && !ios) return null

  async function handleClick() {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferred(null)
    } else if (ios) {
      setShowIosSheet(true)
    }
  }

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size={size}
        className={`${fullWidth ? 'w-full' : ''} ${className ?? ''}`.trim()}
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>

      {showIosSheet && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowIosSheet(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              onClick={() => setShowIosSheet(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 inline-flex rounded-2xl bg-indigo-100 p-3">
              <Download className="h-6 w-6 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              Add to Home Screen
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Install Sabudh AI on your iPhone or iPad in two quick steps:
            </p>

            <ol className="mt-4 space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                  1
                </span>
                <span className="text-sm text-gray-700">
                  Tap the <Share className="inline h-4 w-4 -mt-0.5 text-blue-500" />{' '}
                  <strong>Share</strong> button in Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                  2
                </span>
                <span className="text-sm text-gray-700">
                  Choose{' '}
                  <Plus className="inline h-4 w-4 -mt-0.5 text-gray-500" />{' '}
                  <strong>Add to Home Screen</strong>, then tap{' '}
                  <strong>Add</strong>.
                </span>
              </li>
            </ol>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-xs text-green-700">
              <Check className="h-4 w-4 shrink-0" />
              Once added, launch Sabudh AI from your home screen like a native app.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
