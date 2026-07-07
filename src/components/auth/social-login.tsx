'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

type Provider = 'google' | 'apple'

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.62c-.03-2.77 2.26-4.1 2.36-4.16-1.29-1.88-3.29-2.14-4-2.17-1.7-.17-3.32.99-4.18.99-.86 0-2.19-.97-3.6-.94-1.85.03-3.56 1.08-4.51 2.73-1.92 3.34-.49 8.28 1.38 10.99.91 1.33 2 2.82 3.42 2.76 1.37-.05 1.89-.89 3.55-.89 1.65 0 2.12.89 3.57.86 1.47-.02 2.4-1.35 3.3-2.68 1.04-1.53 1.47-3.01 1.49-3.09-.03-.01-2.86-1.1-2.89-4.35ZM13.6 4.48c.76-.92 1.27-2.2 1.13-3.48-1.09.05-2.42.73-3.2 1.65-.7.81-1.31 2.11-1.15 3.36 1.22.1 2.46-.62 3.22-1.53Z" />
    </svg>
  )
}

/**
 * Google / Apple sign-in. Delegates to Supabase OAuth and flows through the
 * existing /auth/callback route. Each provider must be enabled in the Supabase
 * dashboard; until then the button surfaces a clear error.
 */
export function SocialLogin({ next }: { next?: string }) {
  const [loading, setLoading] = useState<Provider | null>(null)

  async function signIn(provider: Provider) {
    setLoading(provider)
    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback${
        next ? `?next=${encodeURIComponent(next)}` : ''
      }`
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      })
      if (error) {
        toast.error(error.message || `Could not sign in with ${provider}.`)
        setLoading(null)
      }
      // On success the browser is redirected to the provider.
    } catch {
      toast.error('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  const buttonClass =
    'flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/80 px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-white active:scale-[0.98] disabled:opacity-50'

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or continue with</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => signIn('google')}
          disabled={loading !== null}
          className={buttonClass}
        >
          {loading === 'google' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Google
        </button>
        <button
          type="button"
          onClick={() => signIn('apple')}
          disabled={loading !== null}
          className={buttonClass}
        >
          {loading === 'apple' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AppleIcon />
          )}
          Apple
        </button>
      </div>
    </div>
  )
}
