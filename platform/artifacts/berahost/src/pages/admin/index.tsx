import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, Server, Activity, TrendingUp, Ticket, CreditCard, ShieldAlert, ArrowRight,
  LifeBuoy, Settings, Cpu, HardDrive, MemoryStick, Zap, RefreshCw, StopCircle,
  AlertTriangle, Radio, CheckCircle, Wifi, Globe, Terminal, Megaphone,
  MessageSquare, X
} from "lucide-react";
import {
  useGetMe,
  useGetAdminStats,
  useGetRevenueChart,
  getGetAdminStatsQueryKey,
  getGetRevenueChartQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar
} from "recharts";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

function useServerHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "server-health"],
    queryFn: async () => {
      const r = await apiFetch("/admin/server-health");
      if (!r.ok) return null;
      return r.json();
    },
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 10_000,
  });
}

function HealthGauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-black font-mono">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-[10px] font-mono text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [fleetConfirm, setFleetConfirm] = useState<"restart-all" | "stop-all" | null>(null);

  const isAdmin = !!user?.isAdmin;
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({
    query: { enabled: isAdmin, queryKey: getGetAdminStatsQueryKey() },
  });
  const { data: revenueData } = useGetRevenueChart({
    query: { enabled: isAdmin, queryKey: getGetRevenueChartQueryKey() },
  });
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useServerHealth(isAdmin);

  const fleetMutation = useMutation({
    mutationFn: (action: "restart-all" | "stop-all") =>
      apiFetch(`/admin/fleet/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Fleet Command Executed", description: data.message });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setFleetConfirm(null);
    },
    onError: () => toast({ title: "Error", description: "Fleet command failed", variant: "destructive" }),
  });

  const broadcastMutation = useMutation({
    mutationFn: (data: { title: string; message: string }) =>
      apiFetch("/admin/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Broadcast Sent!", description: data.message });
      setBroadcastOpen(false);
      setBroadcastTitle("");
      setBroadcastMsg("");
    },
    onError: () => toast({ title: "Error", description: "Broadcast failed", variant: "destructive" }),
  });

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  if (!userLoading && user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  if (statsLoading || userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full mt-6" />
      </div>
    );
  }

  const statCards = [
    { title: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-primary", link: "/admin/users" },
    { title: "Active Bots", value: stats?.activeBots || 0, icon: Radio, color: "text-accent", link: "/admin/deployments" },
    { title: "Today's Revenue", value: `KES ${(stats?.todayRevenue || 0).toLocaleString()}`, icon: TrendingUp, color: "text-secondary", link: null },
    { title: "Active Subscriptions", value: ((stats as any)?.activeSubscriptions || 0).toLocaleString(), icon: CreditCard, color: "text-yellow-400", link: "/admin/payments" },
    { title: "Total Deployments", value: stats?.totalDeployments || 0, icon: Activity, color: "text-primary", link: "/admin/deployments" },
    { title: "Open Tickets", value: stats?.openTickets || 0, icon: Ticket, color: "text-destructive", link: "/admin/support" },
  ];
  const capacity = (stats as any)?.capacity;

  const adminLinks = [
    { name: "User Management", path: "/admin/users", icon: Users },
    { name: "Bot Templates", path: "/admin/bots", icon: Server },
    { name: "All Deployments", path: "/admin/deployments", icon: Activity },
    { name: "Support Tickets", path: "/admin/support", icon: LifeBuoy },
    { name: "Audit Logs", path: "/admin/audit-logs", icon: ShieldAlert },
    { name: "Transactions", path: "/admin/payments", icon: TrendingUp },
    { name: "Platform Settings", path: "/admin/settings", icon: Settings },
  ];

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={item} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-destructive to-primary flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-destructive" /> ADMIN COMMAND CENTER
          </h1>
          <p className="text-muted-foreground font-mono mt-1 text-sm">
            God-mode platform control — full fleet, server, and user authority.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs border-primary/40 hover:border-primary hover:bg-primary/5"
            onClick={() => setBroadcastOpen(true)}
          >
            <Megaphone className="mr-2 h-3 w-3 text-primary" /> BROADCAST
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs border-accent/40 hover:border-accent hover:bg-accent/5"
            onClick={() => setFleetConfirm("restart-all")}
          >
            <RefreshCw className="mr-2 h-3 w-3 text-accent" /> RESTART ALL
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs border-destructive/40 hover:border-destructive hover:bg-destructive/5 text-destructive"
            onClick={() => setFleetConfirm("stop-all")}
          >
            <StopCircle className="mr-2 h-3 w-3" /> EMERGENCY STOP
          </Button>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={item} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, idx) => (
          <Card key={idx} className={`border-border/50 bg-card/40 backdrop-blur-sm ${stat.link ? 'hover:border-primary/50 cursor-pointer group transition-all' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-mono font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{stat.value}</div>
              {stat.link && (
                <Link href={stat.link}>
                  <div className="text-xs text-primary font-mono mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Manage <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Server Health Monitor */}
      <motion.div variants={item}>
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
            <div>
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" /> LIVE SERVER HEALTH
              </CardTitle>
              <CardDescription className="font-mono text-xs mt-1">
                {health ? (
                  <>
                    {health.cpu.model} — {health.cpu.cores} cores — Node {health.nodeVersion}
                    {" · "}
                    <span className="text-accent">Up {Math.floor(health.uptime.systemSeconds / 3600)}h {Math.floor((health.uptime.systemSeconds % 3600) / 60)}m</span>
                  </>
                ) : "Loading system info..."}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => refetchHealth()}>
              <RefreshCw className={`h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : health ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-4">
                  <HealthGauge value={health.cpu.usagePercent} max={100} label="CPU" color="hsl(var(--primary))" />
                  <HealthGauge value={health.memory.usedPercent} max={100} label="RAM" color="hsl(var(--accent))" />
                  <HealthGauge value={health.disk.usedPercent} max={100} label="Disk" color="hsl(var(--secondary))" />
                  <HealthGauge value={(health.bots.running / Math.max(health.bots.running + health.bots.slotsAvailable, 1)) * 100} max={100} label="Bot Slots" color="#f59e0b" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="bg-background/30 rounded-lg p-3 border border-border/30">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1"><Cpu className="h-3 w-3" /> Load Avg</div>
                    <div className="font-bold text-primary">{health.cpu.loadAvg.map((v: number) => v.toFixed(2)).join(" / ")}</div>
                    <div className="text-muted-foreground text-[10px]">1m / 5m / 15m</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3 border border-border/30">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1"><MemoryStick className="h-3 w-3" /> Memory</div>
                    <div className="font-bold text-accent">{health.memory.usedGb} / {health.memory.totalGb} GB</div>
                    <div className="text-muted-foreground text-[10px]">Process: {health.memory.processRss} MB</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3 border border-border/30">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1"><HardDrive className="h-3 w-3" /> Storage</div>
                    <div className="font-bold text-secondary">{health.disk.usedGb} / {health.disk.totalGb} GB</div>
                    <div className="text-muted-foreground text-[10px]">{health.disk.usedPercent}% used</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3 border border-border/30">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1"><Radio className="h-3 w-3" /> Bot Fleet</div>
                    <div className="font-bold text-yellow-400">{health.bots.running} active</div>
                    <div className="text-muted-foreground text-[10px]">{health.bots.slotsAvailable.toLocaleString()} slots free</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground font-mono text-sm text-center py-6">Server health unavailable</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Capacity + Revenue */}
      {capacity && (
        <motion.div variants={item}>
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <div>
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" /> PLATFORM CAPACITY
                </CardTitle>
                <CardDescription className="font-mono text-xs mt-1">
                   {capacity.slotsAvailable.toLocaleString()} of {capacity.slotsTotal.toLocaleString()} bot slots available
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-accent">{capacity.slotsUsed}</div>
                <div className="text-xs font-mono text-muted-foreground">running now</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, hsl(var(--accent)), hsl(var(--primary)))" }}
                  initial={{ width: 0 }}
                   animate={{ width: `${Math.max((capacity.slotsUsed / capacity.slotsTotal) * 100, 0.3)}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-muted-foreground mt-2">
                 <span>{((capacity.slotsUsed / capacity.slotsTotal) * 100).toFixed(2)}% used</span>
                 <span>Max: {capacity.maxConcurrentBots.toLocaleString()} bots</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Revenue Chart — not animated because Recharts ResponsiveContainer
            mis-measures its container width if rendered while Framer Motion
            is still in its initial (opacity:0 / y:20) state, causing a layout glitch. */}
        <div className="md:col-span-2">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-secondary" /> REVENUE — LAST 30 DAYS
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              {revenueData && revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11}
                      tickFormatter={(v) => {
                        // Parse YYYY-MM-DD without timezone offset by splitting manually
                        const [y, m, d] = String(v).split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
                      }} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      itemStyle={{ color: "hsl(var(--secondary))", fontWeight: "bold" }}
                      labelFormatter={(v) => {
                        const [y, m, d] = String(v).split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric" });
                      }}
                    />
                    <Area type="monotone" dataKey="revenue" name="KES Revenue" stroke="hsl(var(--secondary))" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground font-mono text-sm gap-2">
                  <TrendingUp className="h-8 w-8 opacity-20" />
                  No revenue data yet — first payments will appear here
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Management Links */}
        <motion.div variants={item}>
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary" /> CONTROL PANEL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {adminLinks.map((link, idx) => (
                  <Link key={idx} href={link.path}>
                    <Button variant="outline" className="w-full justify-start font-mono text-xs border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all mb-1">
                      <link.icon className="mr-2 h-3 w-3 text-primary/70" /> {link.name}
                    </Button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Fleet Confirm Dialog */}
      <AnimatePresence>
        {fleetConfirm && (
          <Dialog open onOpenChange={() => setFleetConfirm(null)}>
            <DialogContent className="border-destructive/30 bg-card/95 backdrop-blur-xl max-w-md">
              <DialogHeader>
                <DialogTitle className="font-black text-xl text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {fleetConfirm === "stop-all" ? "EMERGENCY STOP ALL BOTS" : "RESTART ALL BOTS"}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs mt-2">
                  {fleetConfirm === "stop-all"
                    ? "This will immediately kill ALL running bot processes across every user. Users will be notified. This action is logged."
                    : "This will restart ALL currently running bots. There may be brief downtime for each bot. This action is logged."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 font-mono text-xs" onClick={() => setFleetConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  className={`flex-1 font-mono text-xs ${fleetConfirm === "stop-all" ? "bg-destructive hover:bg-destructive/90" : "bg-accent hover:bg-accent/90"}`}
                  onClick={() => fleetMutation.mutate(fleetConfirm)}
                  disabled={fleetMutation.isPending}
                >
                  {fleetMutation.isPending ? "Executing..." : `CONFIRM ${fleetConfirm === "stop-all" ? "STOP" : "RESTART"}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Broadcast Dialog */}
      <AnimatePresence>
        {broadcastOpen && (
          <Dialog open onOpenChange={setBroadcastOpen}>
            <DialogContent className="border-primary/30 bg-card/95 backdrop-blur-xl max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-black text-xl text-primary flex items-center gap-2">
                  <Megaphone className="h-5 w-5" /> BROADCAST TO ALL USERS
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  This message will appear in every user's notification feed immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Title</label>
                  <Input
                    placeholder="e.g., Scheduled Maintenance — 2:00 AM EAT"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="bg-background/50 font-mono border-primary/30 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Message</label>
                  <Textarea
                    placeholder="Full broadcast message..."
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    className="bg-background/50 font-mono border-primary/30 text-sm min-h-[100px]"
                  />
                </div>
                <Button
                  className="w-full font-mono bg-primary hover:bg-primary/90 shadow-[0_0_15px_rgba(255,0,80,0.3)]"
                  onClick={() => broadcastMutation.mutate({ title: broadcastTitle, message: broadcastMsg })}
                  disabled={broadcastMutation.isPending || !broadcastTitle || !broadcastMsg}
                >
                  {broadcastMutation.isPending ? "Sending..." : `BROADCAST TO ALL USERS`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
