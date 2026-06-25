import Link from "next/link";
import {
  Shield,
  Users,
  BarChart3,
  Clock,
  CheckCircle,
  Mic,
  Camera,
  Award,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Sabudh AI Attendance</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="py-20 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                AI-Powered Attendance
                <span className="text-primary"> Verification</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted">
                Replace manual attendance sheets with multi-layer AI
                verification. Facial recognition, speech verification, classroom
                detection, and liveness checks — all in under 30 seconds.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="#features"
                  className="rounded-lg border border-border px-6 py-3 text-sm font-semibold hover:bg-secondary transition-colors"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                Everything you need to manage attendance
              </h2>
              <p className="mt-4 text-muted">
                A complete platform for educational institutions that need
                reliable, fraud-resistant attendance tracking.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Camera,
                  title: "Face Verification",
                  desc: "Match attendance selfies against enrollment photos",
                },
                {
                  icon: Mic,
                  title: "Speech Verification",
                  desc: "Verify spoken random words to prevent replay attacks",
                },
                {
                  icon: Clock,
                  title: "Time Windows",
                  desc: "Configurable attendance windows with server-side validation",
                },
                {
                  icon: CheckCircle,
                  title: "Liveness Detection",
                  desc: "Prevent spoofing with random liveness challenges",
                },
                {
                  icon: Users,
                  title: "Student Management",
                  desc: "Complete lifecycle from enrollment to certification",
                },
                {
                  icon: BarChart3,
                  title: "Real-time Analytics",
                  desc: "Live dashboards with attendance trends and insights",
                },
                {
                  icon: Award,
                  title: "Certificates",
                  desc: "Automatic eligibility tracking and certificate generation",
                },
                {
                  icon: Shield,
                  title: "Fraud Detection",
                  desc: "Multi-signal fraud scoring with admin review queue",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl bg-white p-6 shadow-sm border"
                >
                  <feature.icon className="h-8 w-8 text-primary" />
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                How it works
              </h2>
              <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
                {[
                  {
                    step: "1",
                    title: "Open Dashboard",
                    desc: "Log in and see your attendance status instantly",
                  },
                  {
                    step: "2",
                    title: "Mark Attendance",
                    desc: "Read the random word, look at the camera, submit",
                  },
                  {
                    step: "3",
                    title: "Verified Instantly",
                    desc: "AI verifies your identity and records attendance",
                  },
                ].map((item) => (
                  <div key={item.step} className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white font-bold text-lg">
                      {item.step}
                    </div>
                    <h3 className="mt-4 font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted">
            &copy; {new Date().getFullYear()} Sabudh Foundation. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
