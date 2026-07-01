"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ElectricBorder } from "@/components/ui/electric-border";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(searchParams.get("error") === "auth_callback_error" ? "Authentication failed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const message = searchParams.get("message");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const { data: { user: loggedInUser } } = await supabase.auth.getUser()
      if (loggedInUser) {
        const { data: role } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', loggedInUser.id)
          .single()

        if (role?.role === 'admin' || role?.role === 'super_admin') {
          router.push('/admin')
        } else if (role?.role === 'instructor') {
          const { data: tp } = await supabase
            .from('teacher_profiles')
            .select('status')
            .eq('auth_user_id', loggedInUser.id)
            .single()
          router.push(tp?.status === 'pending' ? '/pending-approval' : '/teacher')
        } else {
          const { data: sp } = await supabase
            .from('student_profiles')
            .select('status')
            .eq('auth_user_id', loggedInUser.id)
            .single()
          router.push(sp?.status === 'pending' ? '/pending-approval' : '/dashboard')
        }
      } else {
        router.push('/dashboard')
      }
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError("Failed to sign in with Google.");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/90 shadow-lg shadow-indigo-500/20">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Sabudh AI</span>
        </Link>
        <h1 className="mt-8 text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign in to your account to continue
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <ElectricBorder borderRadius={16} duration={4}>
        <div className="glass rounded-2xl p-8 shadow-spatial">
          {message && (
            <div className="mb-6 rounded-xl bg-emerald-50/70 p-4 text-sm text-emerald-700 border border-emerald-200/50 backdrop-blur-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-6 rounded-xl bg-red-50/70 p-4 text-sm text-red-600 border border-red-200/50 backdrop-blur-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full rounded-xl glass py-2.5 text-sm font-semibold text-gray-700 hover:bg-white/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98] mb-6"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            {googleLoading ? "Redirecting..." : "Sign in with Google"}
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/30" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white/50 px-3 text-gray-400 backdrop-blur-sm rounded-full">or continue with email</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl px-3 py-2.5 text-sm glass-input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm glass-input"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-indigo-500/90 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:bg-indigo-500 hover:shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
        </ElectricBorder>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-indigo-600 font-medium hover:text-indigo-500 transition-colors">
          Create account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
