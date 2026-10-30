import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  ExternalLink,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Loader2,
  Plus,
  Server,
  Sparkles,
  Terminal,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  useGetMe,
  useListBots,
  useListDeployments,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL;

type WebDeployment = {
  id: number;
  slug: string;
  customName?: string | null;
  repoUrl: string;
  branch: string;
  status: string;
  publicUrl: string;
  createdAt?: string;
  updatedAt?: string;
};

type Project = {
  id: string;
  name: string;
  source: string;
  status: string;
  href: string;
  url?: string;
  createdAt?: string;
  kind: "bot" | "web";
};

function statusTone(status: string) {
  if (status === "running") return "border-accent/30 bg-accent/10 text-accent";
  if (["queued", "building", "deploying", "starting"].includes(status)) return "border-primary/30 bg-primary/10 text-primary";
  if (["failed", "crashed"].includes(status)) return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted/30 text-muted-foreground";
}

function statusDot(status: string) {
  if (status === "running") return "bg-accent shadow-[0_0_12px_hsl(var(--accent))]";
  if (["queued", "building", "deploying", "starting"].includes(status)) return "bg-primary animate-pulse";
  if (["failed", "crashed"].includes(status)) return "bg-destructive shadow-[0_0_12px_hsl(var(--destructive))]";
  return "bg-muted-foreground/60";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function relativeTime(value?: string) {
  if (!value) return "Recently";
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SignalChart({ running, building, failed }: { running: number; building: number; failed: number }) {
  const points = [
    38 + running * 5,
    48 + building * 5,
    30 + running * 4,
    52 + failed * 8,
    34 + running * 5,
    44 + building * 7,
    27 + running * 4,
    39 + failed * 7,
  ].map((point) => Math.min(82, point));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${index * 43 + 10} ${point}`).join(" ");
  const area = `${path} L 311 104 L 10 104 Z`;

  return (
    <svg viewBox="0 0 321 112" className="h-28 w-full overflow-visible" role="img" aria-label="Current project activity signal">
      <defs>
        <linearGradient id="signal-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".28" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[22, 50, 78, 104].map((y) => <line key={y} x1="0" x2="321" y1={y} y2={y} stroke="hsl(var(--border))" strokeOpacity=".45" strokeDasharray="3 5" />)}
      <path d={area} fill="url(#signal-fill)" />
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M 10 91 C 48 82, 81 90, 123 83 S 208 92, 311 78" fill="none" stroke="hsl(var(--destructive))" strokeLinecap="round" strokeWidth="1.7" strokeOpacity=".75" />
    </svg>
  );
}

export default function Dashboard() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: deployments, isLoading: deploymentsLoading } = useListDeployments();
  const { data: bots, isLoading: botsLoading } = useListBots();
  const { data: webDeployments = [], isLoading: webLoading } = useQuery<WebDeployment[]>({
    queryKey: ["dashboard-web-deployments"],
    queryFn: async () => {
      const response = await fetch(`${BASE}api/web-deployments`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load web deployments");
      return response.json();
    },
    refetchInterval: 15000,
  });

  const projects = useMemo<Project[]>(() => {
    const botProjects = (deployments ?? []).map((deployment: any) => ({
      id: `bot-${deployment.id}`,
      name: deployment.customName || deployment.bot?.name || `Bot #${deployment.botId}`,
      source: deployment.bot?.name || `Bot deployment ${deployment.id}`,
      status: deployment.status,
      href: `/deployments/${deployment.id}`,
      createdAt: deployment.createdAt,
      kind: "bot" as const,
    }));
    const webProjects = webDeployments.map((deployment) => ({
      id: `web-${deployment.id}`,
      name: deployment.customName || deployment.slug,
      source: `${deployment.repoUrl.replace("https://github.com/", "")} · ${deployment.branch}`,
      status: deployment.status,
      href: "/web-deployments",
      url: deployment.publicUrl,
      createdAt: deployment.createdAt,
      kind: "web" as const,
    }));
    return [...botProjects, ...webProjects].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [deployments, webDeployments]);

  const running = projects.filter((project) => project.status === "running").length;
  const building = projects.filter((project) => ["queued", "building", "deploying", "starting"].includes(project.status)).length;
  const failed = projects.filter((project) => ["failed", "crashed"].includes(project.status)).length;
  const total = projects.length;
  const healthyRatio = total ? Math.round(((total - failed) / total) * 100) : 100;
  const isLoading = userLoading || deploymentsLoading || botsLoading || webLoading;
  const emailName = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  const clientName = user?.displayName?.trim() || emailName?.replace(/\b\w/g, (character) => character.toUpperCase()) || "there";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}</div>
        <div className="grid gap-5 xl:grid-cols-[1fr_400px]"><Skeleton className="h-[430px]" /><Skeleton className="h-[430px]" /></div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6 pb-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Workspace command center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{greeting()}, {clientName} <span aria-hidden>👋</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your hosted applications.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/bots"><Button className="bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/.18)] hover:bg-primary/90"><Plus className="mr-2 h-4 w-4" /> New deployment</Button></Link>
          <Link href="/web-deployments"><Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10"><Globe2 className="mr-2 h-4 w-4" /> Web hosting</Button></Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total projects", value: total, detail: `${bots?.length || 0} bot${bots?.length === 1 ? "" : "s"} · ${webDeployments.length} web`, icon: Cloud, tone: "text-primary", ring: "border-primary/25" },
          { label: "Running", value: running, detail: running ? "Live right now" : "Nothing running", icon: CheckCircle2, tone: "text-accent", ring: "border-accent/25" },
          { label: "Building", value: building, detail: building ? "Deployment activity" : "Queue is clear", icon: Loader2, tone: "text-chart-5", ring: "border-chart-5/25" },
          { label: "Failed", value: failed, detail: failed ? "Needs attention" : "All clear", icon: failed ? CircleAlert : Zap, tone: failed ? "text-destructive" : "text-secondary", ring: failed ? "border-destructive/30" : "border-secondary/25" },
        ].map(({ label, value, detail, icon: Icon, tone, ring }) => (
          <Card key={label} className={`soft-card ${ring} overflow-hidden`}>
            <CardContent className="relative p-4">
              <div className="absolute right-4 top-4 rounded-lg bg-background/60 p-2"><Icon className={`h-4 w-4 ${tone}`} /></div>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className={`mt-3 text-3xl font-semibold tracking-tight ${tone}`}>{value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="soft-card overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between border-b border-border/60 pb-4">
            <div><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> System overview</CardTitle><p className="mt-1 text-xs text-muted-foreground">A live signal from your current bot and web runtimes.</p></div>
            <Badge variant="outline" className={failed ? "border-destructive/30 text-destructive" : "border-accent/30 text-accent"}><span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${failed ? "bg-destructive" : "bg-accent shadow-[0_0_8px_hsl(var(--accent))]"}`} />{failed ? "Attention required" : "All systems operational"}</Badge>
          </CardHeader>
          <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_210px]">
            <div><SignalChart running={running} building={building} failed={failed} /><div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Active signal</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-destructive" />Error signal</span></div></div>
            <div className="rounded-xl border border-border/60 bg-background/35 p-4"><div className="mb-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">Project health</span><span className="font-mono text-xl font-semibold text-primary">{healthyRatio}%</span></div><div className="space-y-3 text-xs"><div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Running</span><span className="font-mono text-accent">{running}</span></div><div className="h-1.5 rounded-full bg-muted/50"><div className="h-full rounded-full bg-accent" style={{ width: `${total ? (running / total) * 100 : 0}%` }} /></div></div><div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Building</span><span className="font-mono text-primary">{building}</span></div><div className="h-1.5 rounded-full bg-muted/50"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? (building / total) * 100 : 0}%` }} /></div></div><div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Failed</span><span className="font-mono text-destructive">{failed}</span></div><div className="h-1.5 rounded-full bg-muted/50"><div className="h-full rounded-full bg-destructive" style={{ width: `${total ? (failed / total) * 100 : 0}%` }} /></div></div></div></div>
          </CardContent>
        </Card>

        <Card className="soft-card overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between border-b border-border/60 pb-4"><div><CardTitle className="text-base">Workspace health</CardTitle><p className="mt-1 text-xs text-muted-foreground">Entitlement and runtime readiness.</p></div><div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-primary/25 border-t-primary text-sm font-semibold text-primary">{healthyRatio}%</div></CardHeader>
          <CardContent className="space-y-4 p-5"><div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-accent" /><div><p className="text-sm font-medium">API and workspace online</p><p className="text-xs text-muted-foreground">Live status is available from each deployment.</p></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border/60 bg-background/35 p-3"><HardDrive className="h-4 w-4 text-secondary" /><p className="mt-2 text-lg font-semibold">{user?.subscriptionPlan || "free"}</p><p className="text-[11px] text-muted-foreground">Current plan</p></div><div className="rounded-xl border border-border/60 bg-background/35 p-3"><Server className="h-4 w-4 text-primary" /><p className="mt-2 text-lg font-semibold">{running}/{total || 0}</p><p className="text-[11px] text-muted-foreground">Live projects</p></div></div><Link href="/subscriptions" className="flex items-center justify-between text-xs text-primary hover:underline">Review subscription <ArrowUpRight className="h-3.5 w-3.5" /></Link></CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="soft-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4"><div><CardTitle className="text-base">Recent deployments</CardTitle><p className="mt-1 text-xs text-muted-foreground">Your latest bot and web activity in one place.</p></div><Link href="/deployments" className="flex items-center gap-1 text-xs text-primary hover:underline">View all <ChevronRight className="h-3.5 w-3.5" /></Link></CardHeader>
          <CardContent className="p-0">{projects.length ? projects.slice(0, 6).map((project) => <div key={project.id} className="flex items-center gap-3 border-b border-border/50 px-5 py-3.5 last:border-0 hover:bg-white/[0.025]"><div className={`h-2 w-2 shrink-0 rounded-full ${statusDot(project.status)}`} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{project.name}</p><Badge variant="outline" className={`hidden text-[10px] uppercase sm:inline-flex ${statusTone(project.status)}`}>{project.status}</Badge></div><p className="truncate font-mono text-[11px] text-muted-foreground">{project.source}</p></div><span className="hidden text-[11px] text-muted-foreground sm:block">{relativeTime(project.createdAt)}</span><Link href={project.href}><Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" aria-label={`Open ${project.name}`}><ChevronRight className="h-4 w-4" /></Button></Link></div>) : <div className="p-8 text-center"><Cloud className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">Your workspace is ready</p><p className="mt-1 text-xs text-muted-foreground">Create your first bot or web deployment to see it here.</p></div>}</CardContent>
        </Card>

        <Card className="soft-card overflow-hidden"><CardHeader className="border-b border-border/60 pb-4"><CardTitle className="text-base">Quick actions</CardTitle><p className="mt-1 text-xs text-muted-foreground">Common next steps for your workspace.</p></CardHeader><CardContent className="grid grid-cols-2 gap-3 p-4"><Link href="/bots"><Button variant="outline" className="h-auto w-full flex-col gap-2 border-border/60 py-4 hover:border-primary/50 hover:bg-primary/5"><Bot className="h-5 w-5 text-primary" /><span className="text-xs">New bot</span></Button></Link><Link href="/web-deployments"><Button variant="outline" className="h-auto w-full flex-col gap-2 border-border/60 py-4 hover:border-secondary/50 hover:bg-secondary/5"><Globe2 className="h-5 w-5 text-secondary" /><span className="text-xs">New website</span></Button></Link><Link href="/deployments"><Button variant="outline" className="h-auto w-full flex-col gap-2 border-border/60 py-4 hover:border-accent/50 hover:bg-accent/5"><Terminal className="h-5 w-5 text-accent" /><span className="text-xs">View logs</span></Button></Link><Link href="/settings"><Button variant="outline" className="h-auto w-full flex-col gap-2 border-border/60 py-4 hover:border-chart-5/50 hover:bg-chart-5/5"><LayoutDashboard className="h-5 w-5 text-chart-5" /><span className="text-xs">Workspace settings</span></Button></Link></CardContent></Card>
      </section>

      {failed > 0 && <Link href="/deployments" className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm transition-colors hover:bg-destructive/10"><TriangleAlert className="h-5 w-5 text-destructive" /><span className="flex-1"><strong>{failed} project{failed === 1 ? "" : "s"} need attention.</strong> Open the deployment console to inspect logs and recover.</span><ChevronRight className="h-4 w-4 text-destructive" /></Link>}
    </motion.div>
  );
}
