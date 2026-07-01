"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Check, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoWithText } from "@/components/ui/logo";

const PASSWORD_RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setHasSession(!!user);
      setChecking(false);
    }
    checkSession();
  }, []);

  function isPasswordValid() {
    return PASSWORD_RULES.every((rule) => rule.test(password));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!isPasswordValid()) {
      setError("Please meet all password requirements.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center spatial-bg-rich">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100/60 backdrop-blur-sm border border-emerald-200/50">
            <Check className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Password updated</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your password has been changed successfully. Redirecting you to the dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100/60 backdrop-blur-sm border border-red-200/50">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Invalid or expired link</h1>
          <p className="mt-2 text-sm text-gray-500">
            This password reset link is no longer valid. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block rounded-xl bg-indigo-500/90 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all active:scale-[0.98]"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Link href="/">
            <LogoWithText />
          </Link>
          <h1 className="mt-8 text-2xl font-bold text-gray-900">Set new password</h1>
          <p className="mt-2 text-sm text-gray-500">
            Choose a strong password for your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <div className="glass rounded-2xl p-8 shadow-spatial">
            {error && (
              <div className="mb-6 rounded-xl bg-red-50/70 p-4 text-sm text-red-600 border border-red-200/50 backdrop-blur-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm glass-input"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && (
                  <ul className="mt-2 space-y-1">
                    {PASSWORD_RULES.map((rule) => (
                      <li
                        key={rule.label}
                        className={`flex items-center gap-1.5 text-xs transition-colors ${
                          rule.test(password) ? "text-emerald-600" : "text-gray-400"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-xl px-3 py-2.5 text-sm glass-input"
                  placeholder="Confirm new password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordValid() || password !== confirmPassword}
              className="mt-6 w-full rounded-xl bg-indigo-500/90 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
