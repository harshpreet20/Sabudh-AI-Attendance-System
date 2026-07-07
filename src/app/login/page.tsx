"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ElectricBorder } from "@/components/ui/electric-border";
import { LogoWithText } from "@/components/ui/logo";
import { SocialLogin } from "@/components/auth/social-login";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(searchParams.get("error") === "auth_callback_error" ? "Authentication failed. Please try again." : "");
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="w-full max-w-md">
      <div className="text-center">
        <Link href="/">
          <LogoWithText />
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

          <SocialLogin />
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
