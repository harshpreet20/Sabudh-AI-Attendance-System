import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Logo } from "@/components/ui/logo";
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
  MessageSquare,
  ClipboardList,
  FolderKanban,
  CalendarOff,
  Bot,
  BookOpen,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen spatial-bg-rich">
      <header className="glass-strong sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo size="md" />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-gray-900 leading-tight">Sabudh AI</span>
              <span className="text-[10px] font-medium text-gray-400 tracking-wide">Powered by HotBot Studios</span>
            </div>
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
              Join Program
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
                <BookOpen className="h-3.5 w-3.5" />
                Sabudh Foundation &middot; GEN AI Course
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-gray-900">
                Post-Lecture
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent"> Engagement </span>
                Platform
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-500">
                More than attendance  - a collaborative ecosystem where students and teachers
                connect beyond the classroom. Track attendance with AI verification, collaborate
                through discussions, manage assignments and projects, all in one place.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="group inline-flex items-center gap-2 rounded-xl bg-indigo-500/90 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/25 transition-all duration-200 active:scale-[0.98]"
                >
                  Join the Program
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#features"
                  className="rounded-xl glass px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-white/70 transition-all duration-200 active:scale-[0.98]"
                >
                  Explore Features
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="py-8">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "AI Verification", value: "Multi-Layer" },
                { label: "Collaboration", value: "Real-time" },
                { label: "Location", value: "Geo-Verified" },
                { label: "Platform", value: "All-in-One" },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-2xl p-5 text-center shadow-spatial">
                  <p className="text-lg font-bold text-indigo-600">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Beyond attendance tracking
              </h2>
              <p className="mt-4 text-gray-500">
                A complete post-lecture engagement platform that creates an ecosystem for
                students to collaborate, co-create, and grow with teachers at the forefront.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Camera,
                  title: "Face Verification",
                  desc: "AI-powered selfie matching against enrollment photos",
                  color: "text-violet-500",
                  bg: "bg-violet-100/60",
                },
                {
                  icon: MapPin,
                  title: "Location Verified",
                  desc: "Geo-fenced attendance within 500m of the centre",
                  color: "text-emerald-500",
                  bg: "bg-emerald-100/60",
                },
                {
                  icon: MessageSquare,
                  title: "Discussion Forum",
                  desc: "Threaded discussions with upvotes, moderation, and real-time updates",
                  color: "text-blue-500",
                  bg: "bg-blue-100/60",
                },
                {
                  icon: ClipboardList,
                  title: "Assignments",
                  desc: "Create, submit, and grade assignments with file uploads",
                  color: "text-amber-500",
                  bg: "bg-amber-100/60",
                },
                {
                  icon: FolderKanban,
                  title: "Projects",
                  desc: "Collaborative project management with grading and feedback",
                  color: "text-rose-500",
                  bg: "bg-rose-100/60",
                },
                {
                  icon: Bot,
                  title: "AI Assistant",
                  desc: "Built-in chatbot to navigate, get help, and find answers instantly",
                  color: "text-indigo-500",
                  bg: "bg-indigo-100/60",
                },
                {
                  icon: CalendarOff,
                  title: "Leave Management",
                  desc: "Apply for leave, track approvals, and get email notifications",
                  color: "text-orange-500",
                  bg: "bg-orange-100/60",
                },
                {
                  icon: BarChart3,
                  title: "Analytics & Reports",
                  desc: "Live dashboards with attendance trends and student insights",
                  color: "text-teal-500",
                  bg: "bg-teal-100/60",
                },
                {
                  icon: Award,
                  title: "Certificates",
                  desc: "Automatic eligibility tracking and verifiable certificate generation",
                  color: "text-yellow-500",
                  bg: "bg-yellow-100/60",
                },
                {
                  icon: Users,
                  title: "Student Management",
                  desc: "Enrollment, CSV import, batch management, and progress reviews",
                  color: "text-cyan-500",
                  bg: "bg-cyan-100/60",
                },
                {
                  icon: Clock,
                  title: "Schedules",
                  desc: "Class schedules, events, and assessments with calendar view",
                  color: "text-pink-500",
                  bg: "bg-pink-100/60",
                },
                {
                  icon: Shield,
                  title: "Fraud Detection",
                  desc: "Multi-signal scoring with liveness checks and admin review queue",
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
              <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-4">
                {[
                  {
                    step: "1",
                    title: "Register & Enroll",
                    desc: "Sign up, complete your profile with a photo for face verification",
                  },
                  {
                    step: "2",
                    title: "Attend & Verify",
                    desc: "Mark attendance with location and AI verification in seconds",
                  },
                  {
                    step: "3",
                    title: "Collaborate & Learn",
                    desc: "Discuss, submit assignments, work on projects with your batch",
                  },
                  {
                    step: "4",
                    title: "Earn Certificate",
                    desc: "Meet attendance requirements and get a verifiable certificate",
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

        {/* Location */}
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="glass rounded-2xl p-8 text-center shadow-spatial">
              <MapPin className="mx-auto h-8 w-8 text-indigo-500" />
              <h3 className="mt-4 text-lg font-bold text-gray-900">GK Duggal Memorial Centre</h3>
              <p className="mt-2 text-sm text-gray-500">Rajouri Garden, New Delhi</p>
              <p className="mt-4 text-sm text-gray-400">
                All classes held at Sabudh Foundation. Attendance is geo-verified within 500m of the centre.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
