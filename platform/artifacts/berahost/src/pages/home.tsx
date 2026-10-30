import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  Cloud,
  Code2,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  MessageCircle,
  Play,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const hostedBots = [
  {
    name: "Bera AI",
    description: "A conversational assistant for customer support and daily operations.",
    category: "AI assistant",
    accent: "from-cyan-400 to-blue-500",
    icon: Sparkles,
  },
  {
    name: "Flow Desk",
    description: "Automate FAQs, lead capture, and handoffs from one reliable workspace.",
    category: "Business automation",
    accent: "from-violet-400 to-fuchsia-500",
    icon: Layers3,
  },
  {
    name: "Community Hub",
    description: "Keep groups informed with scheduled updates and helpful workflows.",
    category: "Community",
    accent: "from-emerald-400 to-teal-500",
    icon: Users,
  },
];

const benefits = [
  {
    icon: Rocket,
    title: "Deploy in minutes",
    description: "Choose a bot, add its configuration, and move from idea to live instance without managing servers.",
  },
  {
    icon: Gauge,
    title: "See what is running",
    description: "Named deployments, live status, logs, and pairing tools keep every instance easy to understand.",
  },
  {
    icon: ShieldCheck,
    title: "Built for control",
    description: "Teams, roles, API keys, usage limits, and billing tools give you a dependable operating layer.",
  },
];

const outcomes = [
  {
    quote: "The deployment view makes it immediately clear which assistant is handling each workflow.",
    role: "Operations lead",
    initials: "OL",
    color: "bg-cyan-500/15 text-cyan-300 border-cyan-400/20",
  },
  {
    quote: "We can hand a bot to a teammate with a name, a status, and a clear place to check its logs.",
    role: "Bot builder",
    initials: "BB",
    color: "bg-violet-500/15 text-violet-300 border-violet-400/20",
  },
  {
    quote: "The platform feels focused: configure once, keep an eye on the important signals, and get back to work.",
    role: "Support team",
    initials: "ST",
    color: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
  },
];

function StatusDot({ color = "bg-emerald-400" }: { color?: string }) {
  return <span className={`h-2 w-2 rounded-full ${color} shadow-[0_0_10px_currentColor]`} />;
}

export default function Home() {
  const [introSeen, setIntroSeen] = useState(
    sessionStorage.getItem("introSeen") === "true"
  );
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  useEffect(() => {
    if (!introSeen) {
      const timer = setTimeout(() => {
        sessionStorage.setItem("introSeen", "true");
        setIntroSeen(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [introSeen]);

  useEffect(() => {
    if (introSeen && !isLoading && user) {
      setLocation("/dashboard");
    }
    return undefined;
  }, [introSeen, isLoading, user, setLocation]);

  if (!introSeen) {
    const letters = "BERAHOST".split("");
    return (
      <div className="home-intro fixed inset-0 bg-background text-foreground flex flex-col items-center justify-center overflow-hidden z-50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        <div className="relative z-10 flex text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 to-violet-400">
          {letters.map((letter, i) => (
            <motion.span
              key={i}
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{
                type: "spring",
                damping: 12,
                stiffness: 100,
                delay: i * 0.1,
              }}
              style={{ display: "inline-block", transformOrigin: "bottom" }}
            >
              {letter}
            </motion.span>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-6 text-sm md:text-base text-primary/70 font-mono tracking-[0.25em]"
        >
          BOT HOSTING, WITHOUT THE BUSYWORK
        </motion.p>
      </div>
    );
  }

  return (
    <div className="home-page min-h-screen overflow-hidden bg-[#07111f] text-slate-100 selection:bg-cyan-400/30">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-[-22rem] h-[38rem] w-[58rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-16rem] top-[34rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      </div>

      <header className="relative z-20 border-b border-white/10 bg-[#07111f]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 text-[#07111f] shadow-[0_0_24px_rgba(34,211,238,0.28)]">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-white">BERAHOST</div>
              <div className="hidden text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 sm:block">
                Bot infrastructure
              </div>
            </div>
          </Link>

           <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex" aria-label="Landing page">
             <a href="#platform" data-testid="link-home-platform" className="transition-colors hover:text-white">Platform</a>
             <a href="#how-it-works" data-testid="link-home-how-it-works" className="transition-colors hover:text-white">How it works</a>
             <a href="#bots" data-testid="link-home-bots" className="transition-colors hover:text-white">Hosted bots</a>
             <a href="#stories" data-testid="link-home-stories" className="transition-colors hover:text-white">Operator stories</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link href="/login">
               <Button variant="ghost" data-testid="button-home-sign-in" className="text-slate-300 hover:bg-white/5 hover:text-white">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
               <Button data-testid="button-home-get-started" className="bg-cyan-400 text-[#07111f] shadow-[0_0_18px_rgba(34,211,238,0.2)] hover:bg-cyan-300">
                Get started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5 text-xs font-medium text-cyan-200">
              <StatusDot />
              The calm control layer for your bots
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Run every conversation with{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                confidence.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
              BERAHOST gives teams a clear, reliable way to deploy, name, monitor, and scale WhatsApp bots without becoming a server administrator.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register">
               <Button size="lg" data-testid="button-home-start-hosting" className="h-12 w-full bg-cyan-400 px-6 text-base font-semibold text-[#07111f] hover:bg-cyan-300 sm:w-auto">
                  Start hosting free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#platform">
                 <Button size="lg" variant="outline" data-testid="button-home-see-platform" className="h-12 w-full border-white/15 bg-white/[0.03] px-6 text-base text-slate-200 hover:bg-white/[0.08] hover:text-white sm:w-auto">
                  <Play className="mr-2 h-4 w-4 fill-current" /> See how it works
                </Button>
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
              {["No WhatsApp OTP required", "Named deployments", "Live logs included"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 text-emerald-400" />
                  {item}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute -inset-8 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0c1a2d]/95 shadow-2xl shadow-cyan-950/30">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="ml-2 text-xs font-mono text-slate-500">berahost / command center</span>
                </div>
                <span className="flex items-center gap-2 text-[11px] text-emerald-300">
                  <StatusDot /> All systems operational
                </span>
              </div>
              <div className="grid gap-5 p-5 sm:p-6">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ["03", "Running bots", "text-cyan-300"],
                    ["99.9%", "Uptime", "text-emerald-300"],
                    ["24/7", "Monitoring", "text-violet-300"],
                  ].map(([value, label, color]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div className={`text-xl font-semibold ${color}`}>{value}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/10 bg-[#081525]">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">Your deployments</div>
                      <div className="mt-0.5 text-xs text-slate-500">A clear name for every live instance</div>
                    </div>
                    <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-mono text-cyan-200">LIVE</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {[
                      ["Bera AI — Support", "WhatsApp", "2m ago", "bg-emerald-400"],
                      ["Flow Desk — Nairobi", "WhatsApp", "8m ago", "bg-emerald-400"],
                      ["Community Hub", "WhatsApp", "Stopped", "bg-slate-500"],
                    ].map(([name, platform, activity, dot]) => (
                      <div key={name} className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                            <Bot className="h-4 w-4 text-cyan-300" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-200">{name}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{platform} · {activity}</div>
                          </div>
                        </div>
                        <StatusDot color={dot} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-violet-300/15 bg-violet-300/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Terminal className="h-4 w-4 text-violet-300" />
                    <span className="text-xs text-slate-300">Live logs are flowing normally</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-violet-300" />
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-5 py-7 sm:grid-cols-4 lg:px-8">
            {[
              ["01", "Unified workspace"],
              ["24/7", "Runtime visibility"],
              ["100%", "Named instances"],
              ["∞", "Room to scale"],
            ].map(([value, label]) => (
              <div key={label} className="flex items-center gap-3 border-white/10 sm:border-r sm:last:border-r-0 sm:justify-center">
                <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
                <div className="max-w-[90px] text-xs leading-4 text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </section>

         <section id="platform" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:px-8">
          <div className="max-w-2xl">
             <div className="text-xs font-semibold tracking-[0.2em] text-cyan-300">A better operating layer</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
              Less infrastructure work. More time building useful bots.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Everything your team needs to take a bot from configuration to dependable day-to-day operation lives in one focused workspace.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description }) => (
              <div key={title} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                <div className="mt-6 flex items-center gap-2 text-xs font-medium text-cyan-300 opacity-0 transition-opacity group-hover:opacity-100">
                  Built into BERAHOST <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            ))}
          </div>
        </section>

         <section id="how-it-works" className="scroll-mt-20 border-y border-white/10 bg-[#081525]">
           <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
             <div className="max-w-2xl">
               <div className="text-xs font-semibold tracking-[0.2em] text-violet-300">From template to live instance</div>
               <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">A deployment path your whole team can follow.</h2>
               <p className="mt-4 text-base leading-7 text-slate-400">Choose a maintained bot, provide the values it needs, then keep its status and logs in one place. No server handoff required.</p>
             </div>
             <div className="mt-10 grid gap-4 md:grid-cols-3">
               {[
                 ["01", "Choose a bot", "Start with a ready-to-configure template from the marketplace."],
                 ["02", "Add your settings", "Give the instance a clear name and the environment values it needs."],
                 ["03", "Operate with context", "Check status, open logs, and make the next decision from the same workspace."],
               ].map(([step, title, description]) => (
                 <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-testid={`card-how-it-works-${step}`}>
                   <span className="font-mono text-sm text-cyan-300">{step}</span>
                   <h3 className="mt-8 text-lg font-semibold text-white">{title}</h3>
                   <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                 </div>
               ))}
             </div>
           </div>
         </section>

        <section id="bots" className="scroll-mt-20 border-y border-white/10 bg-[#091729]">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
             <div className="text-xs font-semibold tracking-[0.2em] text-violet-300">Hosted on BERAHOST</div>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  Your bots deserve a home that looks after them.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-400">
                  Start with the bots your team needs today and add more as your workflows grow. Each instance stays visible, organized, and ready to manage.
                </p>
              </div>
              <Link href="/register">
                <Button variant="outline" className="w-fit border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white">
                  Explore the platform <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {hostedBots.map(({ name, description, category, accent, icon: Icon }) => (
                <div key={name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1d32]">
                  <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-white">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        {category}
                      </span>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-white">{name}</h3>
                    <p className="mt-3 min-h-[3rem] text-sm leading-6 text-slate-400">{description}</p>
                    <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
                      <span className="flex items-center gap-2 text-emerald-300"><StatusDot /> Ready to deploy</span>
                      <span className="text-slate-500">Managed instance</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="stories" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
               <div className="text-xs font-semibold tracking-[0.2em] text-emerald-300">Designed for happy operators</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                A calmer way to run customer conversations.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-400">
                The best hosting experience is the one your team understands at a glance. BERAHOST keeps the important signals close and the busywork out of the way.
              </p>
              <div className="mt-8 space-y-3">
                {["Clear ownership for every bot", "A visible home for every environment", "Support when an instance needs attention"].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                      <Check className="h-3 w-3" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {outcomes.map(({ quote, role, initials, color }) => (
                <div key={role} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <MessageCircle className="h-5 w-5 text-cyan-300" />
                  <p className="mt-5 text-sm leading-6 text-slate-300">“{quote}”</p>
                  <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-[10px] font-semibold ${color}`}>
                      {initials}
                    </div>
                    <div className="text-xs">
                      <div className="font-medium text-white">{role}</div>
                      <div className="mt-0.5 text-slate-500">BERAHOST operator</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-24 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/15 via-[#0d2036] to-violet-500/10 px-6 py-12 sm:px-12 sm:py-16">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-200">
                <Code2 className="h-4 w-4" /> Make your next deployment the easy part
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                Your bot is ready. Give it a better place to run.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                Create your free deployer account and see how BERAHOST keeps your bots organized from the first instance onward.
              </p>
              <div className="mt-8">
                <Link href="/register">
                  <Button size="lg" className="bg-white text-[#07111f] hover:bg-slate-100">
                    Create your account <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

       <footer className="relative z-10 border-t border-white/10 px-5 py-10 lg:px-8">
         <div className="mx-auto grid max-w-7xl gap-8 text-sm text-slate-500 sm:grid-cols-[1.2fr_2fr]">
           <div>
             <div className="flex items-center gap-2 text-slate-200"><Cloud className="h-4 w-4 text-cyan-300" /> BERAHOST</div>
             <p className="mt-3 max-w-xs leading-6">A reliable operating layer for WhatsApp bots and the teams that run them.</p>
           </div>
           <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
             <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Explore</p><a href="#platform" className="block py-1.5 hover:text-white">Platform</a><a href="#how-it-works" className="block py-1.5 hover:text-white">How it works</a><a href="#bots" className="block py-1.5 hover:text-white">Hosted bots</a></div>
             <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Account</p><Link href="/login" className="block py-1.5 hover:text-white">Sign in</Link><Link href="/register" className="block py-1.5 hover:text-white">Create account</Link></div>
             <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Trust</p><span className="flex items-center gap-2 py-1.5"><LockKeyhole className="h-3.5 w-3.5 text-cyan-300" /> Secure sessions</span><span className="flex items-center gap-2 py-1.5"><Globe2 className="h-3.5 w-3.5 text-cyan-300" /> Built for anywhere</span></div>
           </div>
         </div>
         <div className="mx-auto mt-8 max-w-7xl border-t border-white/10 pt-5 text-xs text-slate-600">© {new Date().getFullYear()} BERAHOST. Built for focused bot operations.</div>
      </footer>
    </div>
  );
}