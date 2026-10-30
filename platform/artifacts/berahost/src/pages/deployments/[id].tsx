import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { 
  Terminal, ArrowLeft, PlayCircle, StopCircle, Settings, RefreshCw, Server, Lock,
  Copy, Download, Webhook, Cpu, MemoryStick, Activity, Zap, AlertTriangle,
  CheckCircle, Clock, FileText, Globe, Send, Gauge, Smartphone, Loader2, Key
} from "lucide-react";
import {
  useGetDeployment,
  useGetDeploymentLogs,
  useStartDeployment,
  useStopDeployment,
  useUpdateDeploymentEnv,
  getGetDeploymentQueryKey,
  getGetDeploymentLogsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

function MetricBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const danger = pct > 80;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className={danger ? "text-destructive" : color}>{typeof value === "number" && value < 10 ? value.toFixed(1) : Math.round(value)}{label.includes("CPU") ? "%" : " MB"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: danger ? "hsl(var(--destructive))" : color, width: `${pct}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function DeploymentConsole() {
  const [, params] = useRoute("/deployments/:id");
  const deploymentId = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: deployment, isLoading: deploymentLoading, refetch: refetchDeployment } = useGetDeployment(deploymentId, {
    query: { enabled: !!deploymentId, queryKey: getGetDeploymentQueryKey(deploymentId) },
  });
  const { data: initialLogs } = useGetDeploymentLogs(deploymentId, { limit: 200 }, {
    query: { enabled: !!deploymentId, queryKey: getGetDeploymentLogsQueryKey(deploymentId, { limit: 200 }) },
  });

  const [logs, setLogs] = useState<{ id: string | number; logLine: string; logType: string; timestamp: string }[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  // ── Interactive terminal stdin ────────────────────────────────────────────
  const [terminalInput, setTerminalInput] = useState("");
  const terminalInputRef = useRef<HTMLInputElement>(null);

  // ── Pairing code / Connect flow ──────────────────────────────────────────
  const [connectOpen, setConnectOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [connectStep, setConnectStep] = useState<"enter" | "waiting" | "done">("enter");
  const [pairCode, setPairCode] = useState<string | null>(null);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["crash", "restart"]);

  useEffect(() => {
    if (deployment?.envVars) {
      const env = deployment.envVars as Record<string, string>;
      setEnvVars(env);
      if (env["WEBHOOK_URL"]) setWebhookUrl(env["WEBHOOK_URL"]);
      if (env["WEBHOOK_EVENTS"]) setWebhookEvents(env["WEBHOOK_EVENTS"].split(",").filter(Boolean));
    }
  }, [deployment?.envVars]);

  useEffect(() => {
    if (initialLogs && Array.isArray(initialLogs)) {
      setLogs(initialLogs.map((l: any) => ({
        id: l.id || Math.random(),
        logLine: l.logLine,
        logType: l.logType,
        timestamp: l.createdAt
      })));
    }
  }, [initialLogs]);

  useEffect(() => {
    if (!deploymentId) return;
    const sock = io({ path: "/api/ws/socket.io" });
    sock.on("connect", () => sock.emit("join:deployment", deploymentId));
    sock.on(`log:deployment:${deploymentId}`, (d: any) => {
      setLogs(prev => [...prev.slice(-999), {
        id: Math.random(),
        logLine: d.line ?? d.logLine ?? String(d),
        logType: d.logType ?? "stdout",
        timestamp: d.timestamp ?? new Date().toISOString()
      }]);
    });
    sock.on("status_update", () => refetchDeployment());
    // Listen for pairing codes emitted by the bot's stdout
    sock.on(`paircode:${deploymentId}`, (d: any) => {
      const code = d.code as string;
      setPairCode(code);
      setConnectStep("done");
      setConnectOpen(true); // pop modal open automatically when code arrives
    });
    setSocket(sock);
    return () => { sock.emit("leave:deployment", deploymentId); sock.disconnect(); };
  }, [deploymentId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Metrics polling (every 5 seconds when running)
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["deployment-metrics", deploymentId],
    queryFn: () => apiFetch(`/deployments/${deploymentId}/metrics`).then(r => r.json()),
    refetchInterval: deployment?.status === "running" ? 5000 : false,
    enabled: !!deploymentId,
  });

  const stopMutation = useStopDeployment({
    mutation: {
      onSuccess: () => { toast({ title: "Bot stopping..." }); refetchDeployment(); },
      onError: (err) => toast({ title: "Error", description: (err as any).error || "Failed to stop", variant: "destructive" }),
    }
  });

  const startMutation = useStartDeployment({
    mutation: {
      onSuccess: () => { toast({ title: "Bot starting..." }); refetchDeployment(); },
      onError: (err) => toast({ title: "Error", description: (err as any).error || "Failed to start", variant: "destructive" }),
    }
  });

  const updateEnvMutation = useUpdateDeploymentEnv({
    mutation: {
      onSuccess: () => { toast({ title: "Config Saved", description: "Restart bot to apply changes." }); refetchDeployment(); },
      onError: (err) => toast({ title: "Update Failed", description: (err as any).error || "Failed", variant: "destructive" }),
    }
  });

  // ── Connect via pairing code ─────────────────────────────────────────────
  const phoneMutation = useMutation({
    mutationFn: (phone: string) =>
      apiFetch(`/deployments/${deploymentId}/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      }).then(r => r.json()),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Error", description: d.error, variant: "destructive" }); return; }
      setConnectStep("waiting");
    },
    onError: () => toast({ title: "Error", description: "Failed to submit phone number", variant: "destructive" }),
  });

  // Poll for pairing code every 3 seconds while waiting
  useQuery({
    queryKey: ["paircode", deploymentId],
    queryFn: () => apiFetch(`/deployments/${deploymentId}/paircode`).then(r => r.json()),
    enabled: connectStep === "waiting",
    refetchInterval: 3000,
    select: (d: any) => d.code as string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (code: any) => {
      if (code) { setPairCode(code); setConnectStep("done"); }
    },
  } as any);

  const cloneMutation = useMutation({
    mutationFn: () => apiFetch(`/deployments/${deploymentId}/clone`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Error", description: d.error, variant: "destructive" }); return; }
      toast({ title: "Deployment Cloned!", description: `New instance #${d.id} created (stopped). Set SESSION_ID to start it.` });
      setCloneDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["listDeployments"] });
      setLocation("/deployments");
    },
    onError: () => toast({ title: "Error", description: "Clone failed", variant: "destructive" }),
  });

  const webhookMutation = useMutation({
    mutationFn: () => apiFetch(`/deployments/${deploymentId}/webhook`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, events: webhookEvents }),
    }).then(r => r.json()),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Error", description: d.error, variant: "destructive" }); return; }
      toast({ title: "Webhook Saved" });
      refetchDeployment();
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: () => apiFetch(`/deployments/${deploymentId}/webhook/test`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Webhook Failed", description: d.error, variant: "destructive" }); return; }
      toast({ title: d.success ? "✓ Webhook Delivered" : "Webhook Failed", description: `Status: ${d.statusCode}`, variant: d.success ? "default" : "destructive" });
    },
  });

  const downloadLogs = async (format: "txt" | "json") => {
    const url = `${BASE}api/deployments/${deploymentId}/logs/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `deployment-${deploymentId}-logs.${format}`;
    a.click();
  };

  // Send a line of text to the bot's stdin via Socket.io
  const sendTerminalInput = useCallback(() => {
    const line = terminalInput.trim();
    if (!line || !socket) return;
    socket.emit("stdin:deployment", { deploymentId, input: line });
    setTerminalInput("");
    terminalInputRef.current?.focus();
  }, [terminalInput, socket, deploymentId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "text-accent border-accent/30 bg-accent/10";
      case "stopped": return "text-muted-foreground border-border bg-muted/20";
      case "deploying": return "text-primary border-primary/30 bg-primary/10 animate-pulse";
      case "crashed": return "text-destructive border-destructive/30 bg-destructive/10";
      default: return "text-muted-foreground";
    }
  };

  // Classify a log entry into a severity level by combining the stored
  // logType with keyword analysis of the actual log line text.
  const classifyLog = (type: string, line: string): "error" | "warn" | "success" | "system" | "stdin" | "info" => {
    const t = type?.toLowerCase() ?? "";
    if (t === "stdin") return "stdin";
    const l = line?.toLowerCase() ?? "";

    if (t === "error" || t === "stderr") return "error";
    if (t === "warn")  return "warn";
    if (t === "system" || t === "info") return "system";

    // Content-based detection (catches stdout lines that are actually errors/warnings)
    if (
      l.includes("error") || l.includes("err:") || l.includes("[error]") ||
      l.includes("exception") || l.includes("unhandledrejection") ||
      l.includes("fatal") || l.includes("failed") || l.includes("failure") ||
      l.includes("crash") || l.includes("econnrefused") || l.includes("cannot find") ||
      l.includes("typeerror") || l.includes("syntaxerror") || l.includes("referenceerror")
    ) return "error";

    if (
      l.includes("warn") || l.includes("[warn]") || l.includes("warning") ||
      l.includes("deprecated") || l.includes("⚠") || l.includes("caution")
    ) return "warn";

    if (
      l.includes("✓") || l.includes("✔") || l.includes("success") ||
      l.includes("connected") || l.includes("ready") || l.includes("started") ||
      l.includes("online") || l.includes("logged in") || l.includes("authenticated") ||
      l.includes("done") || l.includes("complete")
    ) return "success";

    if (
      l.startsWith("[berahost]") || t === "info" ||
      l.includes("[info]") || l.includes("[system]")
    ) return "system";

    return "info";
  };

  const LOG_STYLES: Record<string, { text: string; border: string; badge: string; badgeText: string }> = {
    error:   { text: "text-red-400",    border: "border-l-2 border-red-500/60",    badge: "bg-red-500/20 text-red-400",    badgeText: "ERR" },
    warn:    { text: "text-yellow-400", border: "border-l-2 border-yellow-500/50", badge: "bg-yellow-500/20 text-yellow-400", badgeText: "WRN" },
    success: { text: "text-emerald-400",border: "border-l-2 border-emerald-500/50",badge: "bg-emerald-500/20 text-emerald-400",badgeText: "OK " },
    system:  { text: "text-primary",    border: "border-l-2 border-primary/40",    badge: "bg-primary/15 text-primary",    badgeText: "SYS" },
    stdin:   { text: "text-cyan-300",   border: "border-l-2 border-cyan-500/50",   badge: "bg-cyan-500/20 text-cyan-300",  badgeText: "IN " },
    info:    { text: "text-foreground/80", border: "border-l border-transparent",  badge: "",                               badgeText: "" },
  };

  const toggleWebhookEvent = (event: string) => {
    setWebhookEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  };

  if (deploymentLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-2">Deployment not found</h2>
        <Link href="/deployments"><Button variant="outline">Return to Deployments</Button></Link>
      </div>
    );
  }

  const isRunning = deployment.status === "running";
  const isDeploying = deployment.status === "deploying";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Top bar */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <Link href="/deployments">
          <Button variant="ghost" size="sm" className="font-mono text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> BACK
          </Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          {/* Clone */}
          <Button variant="outline" size="sm" className="font-mono text-xs border-secondary/30 text-secondary hover:bg-secondary/5"
            onClick={() => setCloneDialogOpen(true)}>
            <Copy className="mr-1.5 h-3 w-3" /> CLONE
          </Button>

          {/* Connect via pairing code — only for WhatsApp bots */}
          {(deployment.bot?.platform === "whatsapp" || deployment.platform === "whatsapp") && (
            <Button variant="outline" size="sm"
              className="font-mono text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => { setConnectStep("enter"); setPairCode(null); setPhoneInput(""); setConnectOpen(true); }}>
              <Smartphone className="mr-1.5 h-3 w-3" /> CONNECT
            </Button>
          )}

          {/* Log export */}
          <Button variant="outline" size="sm" className="font-mono text-xs border-border/50 hover:border-primary/50"
            onClick={() => downloadLogs("txt")}>
            <Download className="mr-1.5 h-3 w-3 text-primary" /> EXPORT LOGS
          </Button>

          {/* Start / Stop */}
          {isRunning || isDeploying ? (
            <Button variant="outline" size="sm" className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => stopMutation.mutate({ id: deploymentId })}
              disabled={stopMutation.isPending}>
              <StopCircle className="mr-1.5 h-3 w-3" /> STOP
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="font-mono text-xs border-accent/30 text-accent hover:bg-accent/5"
              onClick={() => startMutation.mutate({ id: deploymentId })}
              disabled={startMutation.isPending}>
              <PlayCircle className="mr-1.5 h-3 w-3" /> START
            </Button>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { refetchDeployment(); refetchMetrics(); }}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Info bar */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-background/50 border border-border flex items-center justify-center">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black">
                {(deployment as any).customName || deployment.bot?.name || `Instance #${deployment.id}`}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(deployment.status)}`}>
                  {deployment.status === "running" && <span className="inline-block h-1.5 w-1.5 bg-accent rounded-full mr-1 animate-pulse" />}
                  {deployment.status}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">ID: {deployment.id}</span>
                {deployment.pid && <span className="text-xs font-mono text-muted-foreground">PID: {deployment.pid}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs font-mono text-muted-foreground flex-wrap">
            {metrics && isRunning && (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase">CPU</span>
                  <span className={`font-bold ${metrics.cpu > 80 ? "text-destructive" : "text-primary"}`}>{metrics.cpu}%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase">RAM</span>
                  <span className="font-bold text-accent">{metrics.memMb} MB</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase">Uptime</span>
                  <span className="font-bold text-yellow-400">{Math.floor((metrics.uptime || 0) / 3600)}h {Math.floor(((metrics.uptime || 0) % 3600) / 60)}m</span>
                </div>
              </>
            )}
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase">Platform</span>
              <span className="text-foreground capitalize">{deployment.bot?.platform || "—"}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase">Storage</span>
              <span className="text-foreground">{deployment.storageUsedMb || 0}/{deployment.storageLimitMb || 500} MB</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="terminal" className="w-full">
        <TabsList className="font-mono text-xs bg-background/50 border border-border/50">
          <TabsTrigger value="terminal" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <FileText className="mr-1.5 h-3 w-3" /> Logs
          </TabsTrigger>
          <TabsTrigger value="metrics" className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
            <Gauge className="mr-1.5 h-3 w-3" /> Metrics
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary">
            <Settings className="mr-1.5 h-3 w-3" /> Config
          </TabsTrigger>
          <TabsTrigger value="webhook" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Webhook className="mr-1.5 h-3 w-3" /> Webhook
          </TabsTrigger>
        </TabsList>

        {/* TERMINAL */}
        <TabsContent value="terminal" className="mt-4">
          <Card className="border-primary/20 bg-black/90 relative overflow-hidden shadow-[0_0_30px_rgba(0,212,255,0.05)]">
            <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary/50 via-secondary/50 to-primary/50" />
            <CardHeader className="py-2 px-4 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between">
              <CardTitle className="font-mono text-xs flex items-center gap-2 text-primary/80">
                <Terminal className="h-3 w-3" /> LIVE DEPLOYMENT LOGS
                {isRunning && <span className="h-1.5 w-1.5 bg-accent rounded-full animate-pulse" />}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => downloadLogs("txt")}>
                  <FileText className="mr-1 h-3 w-3" /> .txt
                </Button>
                <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => downloadLogs("json")}>
                  <FileText className="mr-1 h-3 w-3" /> .json
                </Button>
                <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setLogs([])}>
                  CLR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[460px]">
                <div className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
                  {logs.length === 0 ? (
                    <div className="text-muted-foreground/40 text-center py-16">
                      {isRunning ? "Streaming logs..." : "Start the bot to see logs"}
                    </div>
                  ) : (
                    logs.map((log, idx) => {
                      const level = classifyLog(log.logType, log.logLine);
                      const style = LOG_STYLES[level];
                      return (
                        <div key={idx} className={`mb-0.5 flex gap-2 hover:bg-white/5 pl-2 pr-1 py-0.5 rounded ${style.border}`}>
                          <span className="text-muted-foreground/30 shrink-0 w-[72px] text-[10px] pt-px select-none">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          {style.badge && (
                            <span className={`shrink-0 self-start mt-px text-[9px] font-bold rounded px-1 py-px font-mono ${style.badge}`}>
                              {style.badgeText}
                            </span>
                          )}
                          <span className={`whitespace-pre-wrap break-words ${style.text}`}>{log.logLine}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </ScrollArea>

              {/* ── Interactive stdin input bar ─────────────────────────────── */}
              <div className="border-t border-white/10 bg-black/60 px-3 py-2 flex items-center gap-2">
                <span className="font-mono text-xs text-cyan-400 select-none shrink-0">
                  {isRunning ? "▶" : "■"}
                </span>
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); sendTerminalInput(); }
                  }}
                  placeholder={
                    isRunning
                      ? "Type input and press Enter to send to bot (e.g. phone number for pairing code)..."
                      : "Bot is not running"
                  }
                  disabled={!isRunning}
                  className="flex-1 bg-transparent border-none outline-none font-mono text-xs text-cyan-100 placeholder:text-muted-foreground/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button
                  onClick={sendTerminalInput}
                  disabled={!isRunning || !terminalInput.trim()}
                  className="shrink-0 font-mono text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  SEND
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* METRICS */}
        <TabsContent value="metrics" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" /> RESOURCE USAGE
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Live metrics — updates every 5 seconds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {!isRunning ? (
                  <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                    <StopCircle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    Start the bot to see metrics
                  </div>
                ) : metrics ? (
                  <>
                    <MetricBar value={metrics.cpu} max={100} label="CPU Usage %" color="hsl(var(--primary))" />
                    <MetricBar value={metrics.memMb} max={512} label="Memory (MB)" color="hsl(var(--accent))" />

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {[
                        { label: "PID", value: metrics.pid ?? "—", color: "text-muted-foreground" },
                        { label: "Threads", value: metrics.threads ?? 0, color: "text-secondary" },
                        { label: "Logs/hr", value: metrics.logsLastHour ?? 0, color: "text-yellow-400" },
                        { label: "Uptime", value: `${Math.floor((metrics.uptime || 0) / 60)}m`, color: "text-accent" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-background/30 rounded-lg p-3 border border-border/30">
                          <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">{label}</div>
                          <div className={`text-base font-black font-mono ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <Button variant="outline" size="sm" className="w-full font-mono text-xs border-border/40 mt-2"
                      onClick={() => refetchMetrics()}>
                      <RefreshCw className="mr-2 h-3 w-3" /> Refresh Metrics
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-secondary" /> LOG EXPORT
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Download all stored logs for this deployment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-background/30 rounded-lg p-4 border border-border/30 text-sm font-mono space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Logs in buffer</span>
                    <span className="text-foreground">{logs.length} lines</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deployment ID</span>
                    <span className="text-primary">#{deploymentId}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={`text-[10px] ${getStatusColor(deployment.status)}`}>
                      {deployment.status}
                    </Badge>
                  </div>
                </div>

                <Button className="w-full font-mono text-xs bg-secondary hover:bg-secondary/90 text-primary-foreground"
                  onClick={() => downloadLogs("txt")}>
                  <Download className="mr-2 h-3 w-3" /> Download .txt (human-readable)
                </Button>
                <Button variant="outline" className="w-full font-mono text-xs border-secondary/30 text-secondary hover:bg-secondary/5"
                  onClick={() => downloadLogs("json")}>
                  <Download className="mr-2 h-3 w-3" /> Download .json (machine-readable)
                </Button>

                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] font-mono text-muted-foreground text-center">
                    Exports up to the last 10,000 log entries
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-4">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <Settings className="h-4 w-4 text-secondary" /> ENVIRONMENT CONFIGURATION
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Restart the bot after saving to apply changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form id="envForm" onSubmit={(e) => {
                e.preventDefault();
                // Strip empty optional-var values before saving so the bot's
                // built-in defaults are used instead of blank strings in .env
                const optKeys = new Set(
                  deployment.bot?.optionalVars
                    ? Object.keys(deployment.bot.optionalVars as Record<string,string>)
                    : []
                );
                const filtered = Object.fromEntries(
                  Object.entries(envVars).filter(([k, v]) => !optKeys.has(k) || v.trim() !== "")
                );
                updateEnvMutation.mutate({ id: deploymentId, data: { envVars: filtered } });
              }} className="space-y-6">
                {/* ── REQUIRED VARIABLES ── */}
                {deployment.bot?.requiredVars && Object.entries(deployment.bot.requiredVars as Record<string, string>).length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold font-mono text-muted-foreground uppercase border-b border-border/50 pb-2 tracking-widest">
                      Required Variables
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {Object.entries(deployment.bot.requiredVars as Record<string, string>).map(([key, desc]) => {
                        const isSessionKey = key === "SESSION_ID" || key === "SESSION";
                        const sessionPrefix = (deployment.bot as any)?.sessionPrefix as string | null | undefined;
                        const isWhatsApp = deployment.bot?.platform === "whatsapp" || deployment.platform === "whatsapp";
                        const sessionVal = envVars[key] || "";
                        const missingPrefix = isSessionKey && isWhatsApp && sessionPrefix && sessionVal.length > 0 && !sessionVal.startsWith(sessionPrefix);
                        const isLocked = key === "SESSION_ID" && !!deployment.sessionIdLocked;
                        return (
                          <div key={key} className="space-y-1.5">
                            <Label htmlFor={key} className="font-mono text-[10px] flex items-center gap-2 text-muted-foreground uppercase">
                              {key}
                              {isLocked && <Lock className="h-2.5 w-2.5 text-destructive" />}
                            </Label>
                            <Input
                              id={key}
                              value={sessionVal}
                              onChange={(e) => setEnvVars(prev => ({ ...prev, [key]: e.target.value }))}
                              disabled={isLocked}
                              placeholder={String(desc)}
                              className={`font-mono text-xs h-8 bg-background/50 ${
                                isLocked
                                  ? "border-border text-muted-foreground cursor-not-allowed"
                                  : missingPrefix
                                  ? "border-yellow-500/60"
                                  : "border-border/50"
                              }`}
                            />
                            {isLocked && (
                              <p className="text-[10px] font-mono text-destructive/70">Locked after deployment</p>
                            )}
                            {missingPrefix && (
                              <div className="flex items-start gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-2 py-1.5">
                                <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                                <p className="text-[10px] font-mono text-yellow-300">
                                  {key} must start with <span className="font-bold text-yellow-200">{sessionPrefix}</span> — without this prefix, the bot connects but ignores all commands.
                                </p>
                              </div>
                            )}
                            {isSessionKey && isWhatsApp && !isLocked && sessionVal === "" && (
                              <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
                                {sessionPrefix && <>Must start with <span className="text-yellow-400 font-bold">{sessionPrefix}</span> · </>}
                                {(deployment.bot as any)?.sessionGuideUrl && (
                                  <a href={(deployment.bot as any).sessionGuideUrl} target="_blank" rel="noreferrer"
                                    className="text-primary hover:underline">Get session ID →</a>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── OPTIONAL VARIABLES ── */}
                {deployment.bot?.optionalVars && Object.entries(deployment.bot.optionalVars as Record<string, string>).length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold font-mono text-muted-foreground uppercase border-b border-border/50 pb-2 tracking-widest">
                      Optional Variables <span className="text-[10px] normal-case font-normal">(leave blank to use bot defaults)</span>
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {Object.entries(deployment.bot.optionalVars as Record<string, string>).map(([key, desc]) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={key} className="font-mono text-[10px] text-muted-foreground uppercase">
                            {key}
                          </Label>
                          <Input
                            id={key}
                            value={envVars[key] || ""}
                            onChange={(e) => setEnvVars(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={String(desc)}
                            className="font-mono text-xs h-8 bg-background/50 border-border/50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
              <div className="pt-6 border-t border-border/50 mt-6">
                <Button type="submit" form="envForm"
                  className="w-full font-mono font-bold bg-secondary hover:bg-secondary/90 text-primary-foreground shadow-[0_0_10px_rgba(180,0,255,0.2)]"
                  disabled={updateEnvMutation.isPending}>
                  {updateEnvMutation.isPending ? "Saving..." : "SAVE CONFIGURATION"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WEBHOOK */}
        <TabsContent value="webhook" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" /> WEBHOOK NOTIFICATIONS
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Get notified when your bot crashes, restarts, or hits an event
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] text-muted-foreground uppercase">Webhook URL</Label>
                  <Input
                    placeholder="https://your-server.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="font-mono text-xs bg-background/50 border-primary/30"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground">
                    POST requests will be sent to this URL on selected events
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-mono text-[10px] text-muted-foreground uppercase">Trigger Events</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["crash", "restart", "start", "stop"].map((event) => (
                      <div key={event} className="flex items-center gap-2 bg-background/30 rounded p-2 border border-border/30 cursor-pointer"
                        onClick={() => toggleWebhookEvent(event)}>
                        <Checkbox
                          checked={webhookEvents.includes(event)}
                          onCheckedChange={() => toggleWebhookEvent(event)}
                        />
                        <span className="font-mono text-xs capitalize">{event}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button className="w-full font-mono bg-primary hover:bg-primary/90"
                  onClick={() => webhookMutation.mutate()}
                  disabled={webhookMutation.isPending}>
                  {webhookMutation.isPending ? "Saving..." : "SAVE WEBHOOK"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <Send className="h-4 w-4 text-accent" /> TEST WEBHOOK
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Send a test payload to verify your endpoint is working
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-background/30 rounded-lg p-3 border border-border/30 font-mono text-xs text-muted-foreground">
                  <div className="text-accent mb-2 font-bold">Test payload structure:</div>
                  <pre className="text-[10px] leading-relaxed overflow-auto">{JSON.stringify({
                    event: "test",
                    deploymentId,
                    message: "Test webhook from BERAHOST",
                    timestamp: new Date().toISOString(),
                  }, null, 2)}</pre>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Current webhook URL</span>
                    <span className="text-primary truncate max-w-[150px]">{webhookUrl || "Not set"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Events configured</span>
                    <span className="text-foreground">{webhookEvents.join(", ") || "none"}</span>
                  </div>
                </div>

                <Button variant="outline" className="w-full font-mono border-accent/30 text-accent hover:bg-accent/5"
                  onClick={() => testWebhookMutation.mutate()}
                  disabled={testWebhookMutation.isPending || !webhookUrl}
                >
                  <Send className="mr-2 h-3 w-3" />
                  {testWebhookMutation.isPending ? "Sending..." : "FIRE TEST WEBHOOK"}
                </Button>

                {!webhookUrl && (
                  <p className="text-[10px] font-mono text-destructive/70 text-center">
                    Set a webhook URL first
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Connect via Pairing Code Modal ─────────────────────────────── */}
      <Dialog open={connectOpen} onOpenChange={(o) => { setConnectOpen(o); if (!o) setConnectStep("enter"); }}>
        <DialogContent className="border-emerald-500/30 bg-card/95 backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-emerald-400 flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> CONNECT WHATSAPP
            </DialogTitle>
            <DialogDescription className="font-mono text-xs mt-1">
              Link your WhatsApp account with a pairing code — no QR scan needed.
            </DialogDescription>
          </DialogHeader>

          {/* ── Step 1: Enter phone number ── */}
          {connectStep === "enter" && (
            <div className="space-y-4 pt-2">
              <div className="bg-background/40 border border-border/40 rounded-lg p-3 font-mono text-xs text-muted-foreground space-y-1">
                <p className="font-bold text-foreground/80">How it works:</p>
                <p>1. Enter your WhatsApp number with country code (no + or spaces)</p>
                <p>2. Start the bot — it will request a pairing code from WhatsApp</p>
                <p>3. Enter the code in WhatsApp → Settings → Linked Devices → Link a Device</p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] text-muted-foreground uppercase">
                  WhatsApp Number (with country code)
                </Label>
                <Input
                  placeholder="e.g. 254712345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value.replace(/[^0-9]/g, ""))}
                  className="font-mono bg-background/50 border-emerald-500/30 focus-visible:ring-emerald-500/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phoneInput.length >= 7) {
                      phoneMutation.mutate(phoneInput);
                    }
                  }}
                />
                <p className="text-[10px] font-mono text-muted-foreground">
                  Include country code — Kenya: 254..., Nigeria: 234..., South Africa: 27...
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 font-mono text-xs" onClick={() => setConnectOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-mono text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                  disabled={phoneInput.length < 7 || phoneMutation.isPending}
                  onClick={() => phoneMutation.mutate(phoneInput)}
                >
                  {phoneMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Saving...</>
                  ) : (
                    <><Smartphone className="mr-1.5 h-3 w-3" /> GET PAIRING CODE</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Waiting for code ── */}
          {connectStep === "waiting" && (
            <div className="space-y-5 pt-2 text-center">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 text-emerald-400 animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground font-mono">Waiting for pairing code...</p>
                <p className="text-xs font-mono text-muted-foreground">
                  The bot is starting up and requesting your pairing code from WhatsApp.
                  This usually takes 30–60 seconds.
                </p>
              </div>
              <div className="bg-background/40 border border-border/40 rounded-lg p-3 font-mono text-xs text-left space-y-1">
                <p className="text-muted-foreground">Number: <span className="text-foreground font-bold">{phoneInput}</span></p>
                <p className="text-muted-foreground">Keep this modal open — the code will appear automatically.</p>
              </div>
              <Button variant="outline" className="w-full font-mono text-xs" onClick={() => { setConnectStep("enter"); phoneMutation.reset(); }}>
                ← Change Number
              </Button>
            </div>
          )}

          {/* ── Step 3: Show the pairing code ── */}
          {connectStep === "done" && pairCode && (
            <div className="space-y-4 pt-2">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <Key className="h-6 w-6 text-emerald-400" />
                  </div>
                </div>
                <p className="font-bold text-emerald-400 font-mono text-sm">Your Pairing Code</p>
              </div>

              {/* The code — big and easy to read */}
              <div className="bg-black/60 border border-emerald-500/50 rounded-xl p-5 text-center shadow-[0_0_20px_rgba(52,211,153,0.15)]">
                <p className="font-mono text-3xl font-black tracking-[0.3em] text-emerald-300 select-all">
                  {pairCode}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full font-mono text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => { navigator.clipboard.writeText(pairCode); toast({ title: "Copied to clipboard!" }); }}
              >
                <Copy className="mr-1.5 h-3 w-3" /> COPY CODE
              </Button>

              <div className="bg-background/40 border border-border/40 rounded-lg p-3 font-mono text-xs space-y-1.5">
                <p className="font-bold text-foreground/80 flex items-center gap-1.5">
                  <Smartphone className="h-3 w-3 text-emerald-400" /> How to enter this code:
                </p>
                <p className="text-muted-foreground">1. Open WhatsApp on your phone</p>
                <p className="text-muted-foreground">2. Settings → Linked Devices → Link a Device</p>
                <p className="text-muted-foreground">3. Tap "Link with phone number instead"</p>
                <p className="text-muted-foreground">4. Enter the code above</p>
              </div>

              <Button className="w-full font-mono text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => { setConnectOpen(false); setConnectStep("enter"); setPairCode(null); }}>
                <CheckCircle className="mr-1.5 h-3 w-3" /> Done — Code Entered
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clone Confirm Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="border-secondary/30 bg-card/95 backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-secondary flex items-center gap-2">
              <Copy className="h-5 w-5" /> CLONE DEPLOYMENT
            </DialogTitle>
            <DialogDescription className="font-mono text-xs mt-2">
              Creates a stopped copy of this deployment without the SESSION_ID (you'll need to add a new one). Costs the same as a new deployment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="bg-background/30 rounded-lg p-3 border border-border/30 font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source instance</span>
                <span className="text-foreground">#{deploymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bot template</span>
                <span className="text-primary">{deployment.bot?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SESSION_ID</span>
                <span className="text-destructive">NOT copied (security)</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 font-mono text-xs" onClick={() => setCloneDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1 font-mono text-xs bg-secondary hover:bg-secondary/90 text-primary-foreground"
                onClick={() => cloneMutation.mutate()}
                disabled={cloneMutation.isPending}>
                {cloneMutation.isPending ? "Cloning..." : "CONFIRM CLONE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
