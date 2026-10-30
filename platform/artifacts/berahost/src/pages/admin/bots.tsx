import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Server,
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Bot,
  Github,
  RefreshCw,
  Loader2,
  Star,
  X,
  ExternalLink,
  Key,
  Info,
  Settings,
  CheckCircle2,
} from "lucide-react";
import {
  useAdminListBots,
  useAdminCreateBot,
  useAdminUpdateBot,
  useAdminDeleteBot,
  useGetMe,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";

interface VarEntry {
  key: string;
  defaultValue: string;
  description: string;
  required: boolean;
}

interface BotFormData {
  name: string;
  repoUrl: string;
  description: string;
  platform: string;
  sessionGuideUrl: string;
  startCommand: string;
  isFeatured: boolean;
  systemDeps: string;
  installPackages: string;
  requiredVars: VarEntry[];
  optionalVars: VarEntry[];
}

const EMPTY_FORM: BotFormData = {
  name: "",
  repoUrl: "",
  description: "",
  platform: "WhatsApp",
  sessionGuideUrl: "",
  startCommand: "npm start",
  isFeatured: false,
  systemDeps: "",
  installPackages: "",
  requiredVars: [],
  optionalVars: [],
};

function VarEditor({
  vars,
  onChange,
  label,
  color,
}: {
  vars: VarEntry[];
  onChange: (v: VarEntry[]) => void;
  label: string;
  color: string;
}) {
  const add = () =>
    onChange([...vars, { key: "", defaultValue: "", description: "", required: true }]);

  const remove = (i: number) => onChange(vars.filter((_, idx) => idx !== i));

  const update = (i: number, field: keyof VarEntry, value: string | boolean) => {
    const copy = [...vars];
    (copy[i] as any)[field] = value;
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className={`font-mono text-xs uppercase ${color}`}>{label}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-xs font-mono border-border/50"
          onClick={add}
        >
          <Plus className="h-3 w-3 mr-1" /> ADD
        </Button>
      </div>
      {vars.length === 0 ? (
        <p className="text-xs text-muted-foreground font-mono py-2 text-center border border-dashed border-border/50 rounded">
          No variables added yet. Click ADD or sync from GitHub.
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {vars.map((v, i) => (
            <div key={i} className="flex gap-2 items-start p-2 rounded bg-background/40 border border-border/30">
              <div className="flex-1 space-y-1">
                <Input
                  value={v.key}
                  onChange={(e) => update(i, "key", e.target.value)}
                  placeholder="VARIABLE_NAME"
                  className="h-7 text-xs font-mono bg-background/50"
                />
                <Input
                  value={v.defaultValue}
                  onChange={(e) => update(i, "defaultValue", e.target.value)}
                  placeholder="Default value (optional)"
                  className="h-7 text-xs font-mono bg-background/50 text-muted-foreground"
                />
                {v.description && (
                  <p className="text-[10px] text-muted-foreground font-mono px-1">{v.description}</p>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBots() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: bots, isLoading, refetch } = useAdminListBots();
  const createMut = useAdminCreateBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template Created", description: "Bot template added successfully." });
        setDialogOpen(false);
        refetch();
      },
      onError: (e: any) =>
        toast({ title: "Error", description: e?.error || "Failed to create", variant: "destructive" }),
    },
  });
  const updateMut = useAdminUpdateBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template Updated", description: "Changes saved." });
        setDialogOpen(false);
        refetch();
      },
      onError: (e: any) =>
        toast({ title: "Error", description: e?.error || "Failed to update", variant: "destructive" }),
    },
  });
  const deleteMut = useAdminDeleteBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deleted", description: "Bot template removed." });
        setDeleteId(null);
        refetch();
      },
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<BotFormData>(EMPTY_FORM);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  if (user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSyncMsg("");
    setDialogOpen(true);
  }

  function openEdit(bot: any) {
    setEditingId(bot.id);
    setSyncMsg("");

    // Parse requiredVars / optionalVars back from { KEY: defaultVal } format
    const parseVars = (obj: Record<string, any> | null): VarEntry[] => {
      if (!obj) return [];
      return Object.entries(obj).map(([key, val]) => ({
        key,
        defaultValue: typeof val === "string" ? val : "",
        description: "",
        required: true,
      }));
    };

    setForm({
      name: bot.name || "",
      repoUrl: bot.repoUrl || "",
      description: bot.description || "",
      platform: bot.platform || "WhatsApp",
      sessionGuideUrl: bot.sessionGuideUrl || "",
      startCommand: bot.startCommand || "npm start",
      isFeatured: bot.isFeatured || false,
      systemDeps: (bot.systemDeps || []).join(", "),
      installPackages: (bot.installPackages || []).join(", "),
      requiredVars: parseVars(bot.requiredVars),
      optionalVars: parseVars(bot.optionalVars),
    });
    setDialogOpen(true);
  }

  async function syncFromGithub() {
    if (!form.repoUrl) {
      toast({ title: "Enter GitHub URL first", variant: "destructive" });
      return;
    }
    setSyncing(true);
    setSyncMsg("");
    try {
      const data = await apiFetch("/api/admin/bots/sync-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: form.repoUrl }),
      });

      const detected: string[] = [];

      // ── Apply metadata from package.json ──────────────────────────────────
      if (data.meta) {
        const { meta } = data;
        setForm((f) => {
          const updates: Partial<BotFormData> = {};

          if (meta.name && !f.name) {
            updates.name = meta.name;
            detected.push(`name: ${meta.name}`);
          }
          if (meta.description && !f.description) {
            updates.description = meta.description;
            detected.push(`description auto-filled`);
          }
          if (meta.startCommand && meta.startCommand !== "npm start") {
            updates.startCommand = meta.startCommand;
            detected.push(`start: ${meta.startCommand}`);
          } else if (meta.startCommand) {
            updates.startCommand = meta.startCommand;
          }
          if (meta.platform) {
            updates.platform = meta.platform;
            detected.push(`platform: ${meta.platform}`);
          }
          if (meta.systemDeps) {
            updates.systemDeps = meta.systemDeps;
            detected.push(`sys deps: ${meta.systemDeps}`);
          }
          if (meta.installPackages) {
            updates.installPackages = meta.installPackages;
            detected.push(`packages detected`);
          }

          return { ...f, ...updates };
        });
      }

      // ── Apply env vars ─────────────────────────────────────────────────────
      if (data.vars && data.vars.length > 0) {
        const newRequired: VarEntry[] = [];
        const newOptional: VarEntry[] = [];

        for (const v of data.vars) {
          const entry: VarEntry = {
            key: v.key,
            defaultValue: v.defaultValue || "",
            description: v.description || "",
            required: true,
          };
          if (/SESSION|TOKEN|KEY|SECRET|AUTH|PASS/i.test(v.key)) {
            newRequired.push(entry);
          } else {
            newOptional.push({ ...entry, required: false });
          }
        }

        setForm((f) => ({ ...f, requiredVars: newRequired, optionalVars: newOptional }));

        const srcFile = data.sourceFile || ".env.example";
        detected.push(`${data.vars.length} env vars from ${srcFile}`);
      }

      if (detected.length > 0) {
        const summary = detected.join(" · ");
        setSyncMsg(`✓ Auto-detected: ${summary}`);
        toast({ title: "Repo Synced", description: `Detected ${detected.length} fields automatically` });
      } else if (data.message) {
        setSyncMsg(data.message);
        toast({ title: "Nothing detected", description: data.message, variant: "destructive" });
      } else {
        setSyncMsg("⚠ No metadata or config file found in this repo.");
        toast({ title: "Nothing detected", description: "Add a package.json or .env.example to the repo.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Sync failed", description: e?.message || "GitHub fetch error", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  function buildVarsObj(vars: VarEntry[]): Record<string, string> | null {
    if (!vars.length) return null;
    return Object.fromEntries(vars.filter((v) => v.key).map((v) => [v.key, v.defaultValue]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.repoUrl || !form.platform) {
      toast({ title: "Required fields missing", description: "Name, GitHub URL, and Platform are required.", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name,
      repoUrl: form.repoUrl,
      description: form.description || null,
      platform: form.platform,
      isFeatured: form.isFeatured,
      sessionGuideUrl: form.sessionGuideUrl || null,
      startCommand: form.startCommand || null,
      systemDeps: form.systemDeps ? form.systemDeps.split(",").map((s) => s.trim()).filter(Boolean) : null,
      installPackages: form.installPackages ? form.installPackages.split(",").map((s) => s.trim()).filter(Boolean) : null,
      requiredVars: buildVarsObj(form.requiredVars),
      optionalVars: buildVarsObj(form.optionalVars),
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate({ data: payload });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" /> BOT TEMPLATES
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {bots?.length || 0} templates · Manage deployable bot blueprints
            </p>
          </div>
        </div>

        <Button
          className="font-mono bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,200,255,0.3)]"
          onClick={openAdd}
        >
          <Plus className="mr-2 h-4 w-4" /> ADD TEMPLATE
        </Button>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : bots && bots.length > 0 ? (
            <div className="divide-y divide-border/50">
              {bots.map((bot: any) => (
                <motion.div
                  key={bot.id}
                  variants={item}
                  className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between gap-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Bot className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg">{bot.name}</h3>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase border-primary/30 text-primary">
                          {bot.platform}
                        </Badge>
                        {bot.isFeatured && (
                          <Badge className="font-mono text-[10px] bg-secondary/20 text-secondary border border-secondary/30 hover:bg-secondary/20">
                            <Star className="h-2.5 w-2.5 mr-1" /> FEATURED
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                        {bot.description || "No description"}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs font-mono text-muted-foreground">
                        <span>v{bot.version}.0</span>
                        <span className="flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          {Object.keys(bot.requiredVars || {}).length} required vars
                        </span>
                        {bot.sessionGuideUrl && (
                          <a
                            href={bot.sessionGuideUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-secondary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" /> Session Guide
                          </a>
                        )}
                        <a
                          href={bot.repoUrl?.replace(/https?:\/\/[^@]*@github\.com\//, "https://github.com/")}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Github className="h-3 w-3" /> Repo
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:self-start shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-mono border-border/50 hover:border-primary/50"
                      onClick={() => openEdit(bot)}
                    >
                      <Edit className="mr-2 h-3 w-3" /> EDIT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-mono border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(bot.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
              <Bot className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-mono">No bot templates yet. Add your first one.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-primary/30 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-xl text-primary flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {editingId ? "EDIT BOT TEMPLATE" : "ADD BOT TEMPLATE"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {editingId
                ? "Update this bot template's configuration."
                : "Add a new deployable WhatsApp bot template. Paste a GitHub URL and sync variables."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            <Tabs defaultValue="basic">
              <TabsList className="grid w-full grid-cols-3 bg-background/50">
                <TabsTrigger value="basic" className="font-mono text-xs">BASIC</TabsTrigger>
                <TabsTrigger value="vars" className="font-mono text-xs">VARIABLES</TabsTrigger>
                <TabsTrigger value="guide" className="font-mono text-xs">SESSION GUIDE</TabsTrigger>
              </TabsList>

              {/* BASIC TAB */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                {/* GitHub URL + Sync */}
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground flex items-center gap-1">
                    <Github className="h-3 w-3" /> GitHub Repository URL *
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.repoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
                      placeholder="https://github.com/owner/repo"
                      className="bg-background/50 font-mono text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 font-mono border-primary/40 text-primary hover:bg-primary/10"
                      onClick={syncFromGithub}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      )}
                      SYNC
                    </Button>
                  </div>
                  {syncMsg && (
                    <p className={`text-xs font-mono ${syncMsg.startsWith("✓") ? "text-green-400" : "text-muted-foreground"}`}>
                      {syncMsg}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Bot Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g., Atassa-MD"
                      className="bg-background/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Platform *</Label>
                    <Input
                      value={form.platform}
                      onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                      placeholder="WhatsApp"
                      className="bg-background/50 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of the bot's features..."
                    className="min-h-[80px] bg-background/50 font-mono resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Start Command</Label>
                    <Input
                      value={form.startCommand}
                      onChange={(e) => setForm((f) => ({ ...f, startCommand: e.target.value }))}
                      placeholder="npm start"
                      className="bg-background/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">System Deps (comma-separated)</Label>
                    <Input
                      value={form.systemDeps}
                      onChange={(e) => setForm((f) => ({ ...f, systemDeps: e.target.value }))}
                      placeholder="ffmpeg, imagemagick"
                      className="bg-background/50 font-mono"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Extra npm Packages (comma-separated)</Label>
                    <Input
                      value={form.installPackages}
                      onChange={(e) => setForm((f) => ({ ...f, installPackages: e.target.value }))}
                      placeholder="sharp, better-sqlite3, @whiskeysockets/baileys"
                      className="bg-background/50 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">Package.json dependencies are installed automatically. Add packages here when the template needs extras.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border border-secondary/20 bg-secondary/5">
                  <Switch
                    id="featured"
                    checked={form.isFeatured}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
                  />
                  <div>
                    <Label htmlFor="featured" className="font-mono text-xs uppercase cursor-pointer flex items-center gap-1">
                      <Star className="h-3 w-3 text-secondary" /> Featured Template
                    </Label>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      Highlighted in the bot marketplace
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* VARIABLES TAB */}
              <TabsContent value="vars" className="space-y-5 mt-4">
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-2">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs font-mono text-muted-foreground">
                    Use <span className="text-primary">SYNC</span> to merge variables from .env, config.env, config/settings JSON, JS, CJS, MJS, setting.js and related files across the repository. Dependencies are installed automatically; use the package field on the Basic tab for extra npm packages.
                  </p>
                </div>

                <VarEditor
                  vars={form.requiredVars}
                  onChange={(v) => setForm((f) => ({ ...f, requiredVars: v }))}
                  label="Required Variables (user must fill these)"
                  color="text-destructive"
                />

                <VarEditor
                  vars={form.optionalVars}
                  onChange={(v) => setForm((f) => ({ ...f, optionalVars: v }))}
                  label="Optional Variables (have defaults)"
                  color="text-muted-foreground"
                />
              </TabsContent>

              {/* SESSION GUIDE TAB */}
              <TabsContent value="guide" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Session ID Guide URL
                  </Label>
                  <Input
                    value={form.sessionGuideUrl}
                    onChange={(e) => setForm((f) => ({ ...f, sessionGuideUrl: e.target.value }))}
                    placeholder="https://your-session-generator.example.com"
                    className="bg-background/50 font-mono"
                  />
                  <p className="text-xs text-muted-foreground font-mono">
                    Link to a webpage where users can generate their session ID (e.g., a paired QR code site). Users will see a button linking to this URL when configuring the bot.
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-border/50 bg-background/30">
                  <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" /> Session ID Instructions (shown to users)
                  </h4>
                  <ol className="text-xs text-muted-foreground font-mono space-y-2 list-decimal list-inside">
                    <li>Open the Session ID Guide URL above</li>
                    <li>Enter your WhatsApp number in international format (e.g., 254712345678)</li>
                    <li>Scan the QR code with WhatsApp on your phone</li>
                    <li>Copy the generated session string starting with <span className="text-primary">Gifted~...</span></li>
                    <li>Paste it into the SESSION_ID field when deploying this bot</li>
                  </ol>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-3">
                    These instructions are shown automatically to users when the SESSION_ID variable is in the required vars list.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                className="font-mono border-border/50"
                onClick={() => setDialogOpen(false)}
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                className="font-mono bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {editingId ? "SAVE CHANGES" : "CREATE TEMPLATE"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="border-destructive/30 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-mono">DELETE TEMPLATE?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              This will permanently remove the bot template. Existing deployments using this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono border-border/50">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}
            >
              DELETE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
