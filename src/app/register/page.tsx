"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Step = 1 | 2 | 3;

const PASSWORD_RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  {
    label: "One special character",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
    date_of_birth: "",
    gender: "",
    profession: "",
    organization_name: "",
    qualification: "",
    city: "",
    emergency_contact: "",
    learning_goal: "",
  });

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function isPasswordValid() {
    return PASSWORD_RULES.every((rule) => rule.test(formData.password));
  }

  function canProceedStep1() {
    return (
      formData.full_name.trim() &&
      formData.email.trim() &&
      formData.phone.trim() &&
      formData.password &&
      formData.password === formData.confirm_password &&
      isPasswordValid()
    );
  }

  function canProceedStep2() {
    return formData.profession.trim() && formData.city.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            phone: formData.phone,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push(
        "/login?message=Check your email to verify your account before signing in."
      );
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <Shield className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">Sabudh AI</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-muted">
            Step {step} of 3 — {step === 1 ? "Account" : step === 2 ? "Personal Info" : "Review"}
          </p>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-16 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="rounded-xl bg-white p-8 shadow-sm border">
            {error && (
              <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100">
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium mb-1.5">
                    Full Name *
                  </label>
                  <input
                    id="full_name"
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => updateField("full_name", e.target.value)}
                    required
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Rahul Sharma"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                    Email Address *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="rahul@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium mb-1.5">
                    Mobile Number *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    required
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      required
                      className="w-full rounded-lg border border-border px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {formData.password && (
                    <ul className="mt-2 space-y-1">
                      {PASSWORD_RULES.map((rule) => (
                        <li
                          key={rule.label}
                          className={`flex items-center gap-1.5 text-xs ${
                            rule.test(formData.password) ? "text-success" : "text-muted"
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
                  <label htmlFor="confirm_password" className="block text-sm font-medium mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    id="confirm_password"
                    type="password"
                    value={formData.confirm_password}
                    onChange={(e) => updateField("confirm_password", e.target.value)}
                    required
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {formData.confirm_password && formData.password !== formData.confirm_password && (
                    <p className="mt-1 text-xs text-danger">Passwords do not match</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1()}
                  className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="dob" className="block text-sm font-medium mb-1.5">
                      Date of Birth
                    </label>
                    <input
                      id="dob"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => updateField("date_of_birth", e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="gender" className="block text-sm font-medium mb-1.5">
                      Gender
                    </label>
                    <select
                      id="gender"
                      value={formData.gender}
                      onChange={(e) => updateField("gender", e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="profession" className="block text-sm font-medium mb-1.5">
                    Profession *
                  </label>
                  <input
                    id="profession"
                    type="text"
                    value={formData.profession}
                    onChange={(e) => updateField("profession", e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Software Engineer"
                  />
                </div>
                <div>
                  <label htmlFor="org" className="block text-sm font-medium mb-1.5">
                    Organization / College
                  </label>
                  <input
                    id="org"
                    type="text"
                    value={formData.organization_name}
                    onChange={(e) => updateField("organization_name", e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Punjab Engineering College"
                  />
                </div>
                <div>
                  <label htmlFor="qualification" className="block text-sm font-medium mb-1.5">
                    Highest Qualification
                  </label>
                  <input
                    id="qualification"
                    type="text"
                    value={formData.qualification}
                    onChange={(e) => updateField("qualification", e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="B.Tech Computer Science"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="city" className="block text-sm font-medium mb-1.5">
                      City *
                    </label>
                    <input
                      id="city"
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Chandigarh"
                    />
                  </div>
                  <div>
                    <label htmlFor="emergency" className="block text-sm font-medium mb-1.5">
                      Emergency Contact
                    </label>
                    <input
                      id="emergency"
                      type="tel"
                      value={formData.emergency_contact}
                      onChange={(e) => updateField("emergency_contact", e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="goal" className="block text-sm font-medium mb-1.5">
                    Learning Goal
                  </label>
                  <textarea
                    id="goal"
                    value={formData.learning_goal}
                    onChange={(e) => updateField("learning_goal", e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="I want to learn AI and machine learning..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={!canProceedStep2()}
                    className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Review your information</h3>
                <div className="space-y-3 text-sm">
                  {[
                    ["Name", formData.full_name],
                    ["Email", formData.email],
                    ["Phone", formData.phone],
                    ["Profession", formData.profession],
                    ["Organization", formData.organization_name],
                    ["City", formData.city],
                    ["Learning Goal", formData.learning_goal],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div
                        key={label}
                        className="flex justify-between border-b border-border pb-2"
                      >
                        <span className="text-muted">{label}</span>
                        <span className="font-medium text-right max-w-[60%] truncate">
                          {value}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-full rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading ? "Creating account..." : "Create account"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
