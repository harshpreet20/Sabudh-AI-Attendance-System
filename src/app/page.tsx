import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import {
  Shield,
  Users,
  BarChart3,
  Clock,
  CheckCircle,
  Mic,
  Camera,
  Award,
  MapPin,
  ArrowRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen spatial-bg-rich">
      <header className="glass-strong sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/90 shadow-lg shadow-indigo-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">Sabudh AI</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white/50 hover:text-gray-900 transition-all duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-indigo-500/90 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/30 transition-all duration-200 active:scale-[0.98]"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-20 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-100/60 px-4 py-1.5 text-sm font-medium text-indigo-700 backdrop-blur-sm border border-indigo-200/50">
                <MapPin className="h-3.5 w-3.5" />
                Location-verified attendance
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-gray-900">
                AI-Powered Attendance
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent"> Verification</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-500">
                Replace manual attendance sheets with multi-layer AI
                verification. Location tracking, facial recognition, and
                real-time analytics — all in under 30 seconds.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="group inline-flex items-center gap-2 rounded-xl bg-indigo-500/90 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/25 transition-all duration-200 active:scale-[0.98]"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#features"
                  className="rounded-xl glass px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-white/70 transition-all duration-200 active:scale-[0.98]"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Everything you need to manage attendance
              </h2>
              <p className="mt-4 text-gray-500">
                A complete platform for educational institutions that need
                reliable, fraud-resistant attendance tracking.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Camera,
                  title: "Face Verification",
                  desc: "Match attendance selfies against enrollment photos",
                  color: "text-violet-500",
                  bg: "bg-violet-100/60",
                },
                {
                  icon: Mic,
                  title: "Speech Verification",
                  desc: "Verify spoken random words to prevent replay attacks",
                  color: "text-rose-500",
                  bg: "bg-rose-100/60",
                },
                {
                  icon: Clock,
                  title: "Time Windows",
                  desc: "Configurable attendance windows with server-side validation",
                  color: "text-amber-500",
                  bg: "bg-amber-100/60",
                },
                {
                  icon: CheckCircle,
                  title: "Liveness Detection",
                  desc: "Prevent spoofing with random liveness challenges",
                  color: "text-emerald-500",
                  bg: "bg-emerald-100/60",
                },
                {
                  icon: Users,
                  title: "Student Management",
                  desc: "Complete lifecycle from enrollment to certification",
                  color: "text-blue-500",
                  bg: "bg-blue-100/60",
                },
                {
                  icon: BarChart3,
                  title: "Real-time Analytics",
                  desc: "Live dashboards with attendance trends and insights",
                  color: "text-indigo-500",
                  bg: "bg-indigo-100/60",
                },
                {
                  icon: Award,
                  title: "Certificates",
                  desc: "Automatic eligibility tracking and certificate generation",
                  color: "text-yellow-500",
                  bg: "bg-yellow-100/60",
                },
                {
                  icon: Shield,
                  title: "Fraud Detection",
                  desc: "Multi-signal fraud scoring with admin review queue",
                  color: "text-red-500",
                  bg: "bg-red-100/60",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="glass rounded-2xl p-6 shadow-spatial hover:bg-white/70 transition-all duration-300 group"
                >
                  <div className={`inline-flex rounded-xl ${feature.bg} p-2.5 backdrop-blur-sm`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="mt-4 font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-gray-500">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                How it works
              </h2>
              <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {[
                  {
                    step: "1",
                    title: "Open Dashboard",
                    desc: "Log in and see your attendance status instantly",
                  },
                  {
                    step: "2",
                    title: "Mark Attendance",
                    desc: "Allow location access, verify you're within range",
                  },
                  {
                    step: "3",
                    title: "Verified Instantly",
                    desc: "AI verifies your location and records attendance",
                  },
                ].map((item) => (
                  <div key={item.step} className="glass rounded-2xl p-8 text-center shadow-spatial">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/90 text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                      {item.step}
                    </div>
                    <h3 className="mt-5 font-semibold text-gray-900">{item.title}</h3>
                    <p className="mt-2 text-sm text-gray-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
