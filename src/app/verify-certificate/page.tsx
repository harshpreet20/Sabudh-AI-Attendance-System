"use client";

import { useState } from "react";
import { Shield, Search, CheckCircle, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function VerifyCertificatePage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    student_name?: string;
    course?: string;
    attendance?: number;
    issued_at?: string;
  } | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("certificates")
        .select("*, student_profiles(full_name), courses(title)")
        .eq("verification_token", token.trim())
        .eq("status", "active")
        .single();

      if (data) {
        setResult({
          valid: true,
          student_name: (data.student_profiles as { full_name: string })?.full_name,
          course: (data.courses as { title: string })?.title,
          attendance: data.attendance_percentage,
          issued_at: data.issued_at,
        });
      } else {
        setResult({ valid: false });
      }
    } catch {
      setResult({ valid: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Sabudh AI</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Verify Certificate</h1>
          <p className="mt-2 text-sm text-muted">
            Enter a certificate verification token to check its authenticity
          </p>
        </div>

        <form onSubmit={handleVerify} className="mt-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter verification token"
              className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Verify
            </button>
          </div>
        </form>

        {result && (
          <div className="mt-8">
            {result.valid ? (
              <div className="rounded-xl bg-white p-8 border border-green-200 text-center">
                <CheckCircle className="mx-auto h-16 w-16 text-success" />
                <h2 className="mt-4 text-xl font-bold text-success">
                  Valid Certificate
                </h2>
                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted">Student</span>
                    <span className="font-medium">{result.student_name}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted">Course</span>
                    <span className="font-medium">{result.course}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted">Attendance</span>
                    <span className="font-medium">{result.attendance}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Issued</span>
                    <span className="font-medium">
                      {result.issued_at
                        ? new Date(result.issued_at).toLocaleDateString("en-IN")
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-white p-8 border border-red-200 text-center">
                <XCircle className="mx-auto h-16 w-16 text-danger" />
                <h2 className="mt-4 text-xl font-bold text-danger">
                  Invalid Certificate
                </h2>
                <p className="mt-2 text-sm text-muted">
                  This verification token is not valid or the certificate has
                  been revoked.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
