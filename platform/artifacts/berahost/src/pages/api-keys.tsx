import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  KeyRound,
  Plus,
  Copy,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
} from "lucide-react";
import { useListApiKeys, useCreateApiKey, useRevokeApiKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDistanceToNow, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SCOPES = [
  {
    id: "read",
    label: "Read",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    description: "View deployments, logs, metrics, subscription status, payment history",
  },
  {
    id: "write",
    label: "Write",
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/30",
    description: "Deploy bots, start/stop, update session ID & env vars, check subscription expiry",
  },
  {
    id: "payments",
    label: "Payments",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/30",
    description: "Initiate M-Pesa payments, purchase subscriptions and domain add-ons",
  },
] as const;

type ScopeId = "read" | "write" | "payments";

const keySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
});

// ─── Code block with copy ─────────────────────────────────────────────────
function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg bg-black/60 border border-border/40 overflow-hidden mt-2">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-white/5">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors">
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre">{code}</pre>
    </div>
  );
}

// ─── Collapsible endpoint doc block ──────────────────────────────────────
function Endpoint({
  method,
  path,
  scope,
  description,
  body,
  responseExample,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  scope: string;
  description: string;
  body?: string;
  responseExample?: string;
}) {
  const [open, setOpen] = useState(false);
  const colors: Record<string, string> = {
    GET: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    POST: "text-green-400 bg-green-400/10 border-green-400/30",
    PUT: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    DELETE: "text-red-400 bg-red-400/10 border-red-400/30",
  };
  const scopeColors: Record<string, string> = {
    read: "border-blue-500/40 text-blue-400",
    write: "border-green-500/40 text-green-400",
    payments: "border-yellow-500/40 text-yellow-400",
  };
  return (
    <div className="border border-border/30 rounded-lg overflow-hidden bg-card/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${colors[method]} shrink-0`}>{method}</span>
        <code className="font-mono text-xs text-foreground/80 flex-1">{path}</code>
        <Badge variant="outline" className={`text-[10px] font-mono shrink-0 ${scopeColors[scope]}`}>{scope}</Badge>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          {body && (
            <>
              <p className="text-xs font-mono text-muted-foreground uppercase">Request Body</p>
              <CodeBlock code={body} lang="json" />
            </>
          )}
          {responseExample && (
            <>
              <p className="text-xs font-mono text-muted-foreground uppercase">Response</p>
              <CodeBlock code={responseExample} lang="json" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const { data: apiKeys, isLoading, refetch } = useListApiKeys();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const createMutation = useCreateApiKey({
    mutation: {
      onSuccess: (data: any) => {
        setNewKey(data.key);
        toast({ title: "API Key Generated", description: "Save this key now — it won't be shown again." });
        form.reset();
        refetch();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.error || "Failed to create API key", variant: "destructive" });
      }
    }
  });

  const revokeMutation = useRevokeApiKey({
    mutation: {
      onSuccess: () => {
        toast({ title: "Key Revoked", description: "The API key has been permanently deactivated." });
        refetch();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.error || "Failed to revoke key", variant: "destructive" });
      }
    }
  });

  const form = useForm<z.infer<typeof keySchema>>({
    resolver: zodResolver(keySchema),
    defaultValues: { name: "", scopes: ["read"] },
  });

  const selectedScopes = form.watch("scopes");

  const onSubmit = (values: z.infer<typeof keySchema>) => {
    createMutation.mutate({ data: { name: values.name, scopes: values.scopes } });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "API key copied to clipboard" });
  };

  const closeDialog = () => { setIsDialogOpen(false); setNewKey(null); };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  const apiBase = `${window.location.protocol}//${window.location.host}${BASE}/api`;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
        <div className="grid gap-4 mt-8">{[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6 max-w-4xl mx-auto" variants={container} initial="hidden" animate="show">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <motion.div variants={item}>
           <h1 className="page-title flex items-center gap-3">
             <KeyRound className="h-7 w-7 text-primary" /> API keys
          </h1>
           <p className="mt-2 text-sm text-muted-foreground">
             Create scoped credentials for scripts and deployment tooling. Keys are shown once.
          </p>
        </motion.div>
        <motion.div variants={item}>
          <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
            <DialogTrigger asChild>
               <Button data-testid="button-create-api-key" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setIsDialogOpen(true)}>
                 <Plus className="mr-2 h-4 w-4" /> Create API key
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/30 bg-card/95 backdrop-blur-xl max-w-md">
              <DialogHeader>
                <DialogTitle className="font-bold text-xl text-primary">GENERATE API KEY</DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Choose a name and the permissions this key should have.
                </DialogDescription>
              </DialogHeader>

              {newKey ? (
                <div className="space-y-4 py-4">
                  <div className="p-4 rounded-lg bg-accent/10 border border-accent/30 text-accent flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm mb-1">Key Generated Successfully</p>
                      <p className="text-xs font-mono opacity-80">Copy this key now. You won't be able to see it again.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={newKey} readOnly className="font-mono text-sm bg-background/80 border-primary/30 text-primary h-12" />
                     <Button size="icon" data-testid="button-copy-new-api-key" aria-label="Copy API key" className="h-12 w-12 shrink-0" onClick={() => copyToClipboard(newKey)}>
                      <Copy className="h-5 w-5" />
                    </Button>
                  </div>
                   <Button className="w-full mt-4" onClick={closeDialog}>I have saved my key</Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Key Name</FormLabel>
                        <FormControl>
                          <Input placeholder="E.g., My Discord Bot, CI/CD Pipeline" {...field} className="bg-background/50 font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="scopes" render={() => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Permissions (Scopes)</FormLabel>
                        <div className="space-y-2 mt-1">
                          {SCOPES.map(scope => (
                            <label key={scope.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedScopes.includes(scope.id) ? scope.bg : "border-border/30 bg-transparent"}`}>
                              <Checkbox
                                checked={selectedScopes.includes(scope.id)}
                                onCheckedChange={(checked) => {
                                  const current = form.getValues("scopes");
                                  form.setValue("scopes", checked ? [...current, scope.id] : current.filter(s => s !== scope.id));
                                }}
                                className="mt-0.5"
                              />
                              <div>
                                <span className={`font-mono text-sm font-bold ${scope.color}`}>{scope.label}</span>
                                <p className="text-xs text-muted-foreground mt-0.5">{scope.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                     <Button type="submit" data-testid="button-submit-api-key" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={createMutation.isPending}>
                       {createMutation.isPending ? "Creating key…" : "Create key"}
                    </Button>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
        </motion.div>
      </div>

      {/* ── Keys list ── */}
      <motion.div variants={item} className="grid gap-4">
        {apiKeys && apiKeys.length > 0 ? (
          apiKeys.map((apiKey: any) => (
            <Card key={apiKey.id} className="border-border/50 bg-card/30 backdrop-blur-sm hover:border-primary/30 transition-all">
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <KeyRound className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-1">{apiKey.name || "Unnamed Key"}</h3>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(apiKey.scopes ?? []).map((s: string) => {
                        const sc = SCOPES.find(x => x.id === s);
                        return (
                          <Badge key={s} variant="outline" className={`text-[10px] font-mono ${sc?.color ?? ""}`}>
                            {s}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {format(new Date(apiKey.createdAt), "MMM d, yyyy")}
                      </span>
                      {apiKey.lastUsed ? (
                        <span className="flex items-center gap-1 text-primary/70">
                          Last used {formatDistanceToNow(new Date(apiKey.lastUsed), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">Never used</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                       <Button variant="outline" size="sm" data-testid={`button-revoke-api-key-${apiKey.id}`} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                         <Trash2 className="mr-2 h-3 w-3" /> Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-destructive/30 bg-card/95 backdrop-blur-xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="h-5 w-5" /> Revoke API Key?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-mono">
                          This cannot be undone. Any app using this key will immediately lose API access.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90 font-mono text-destructive-foreground"
                          onClick={() => revokeMutation.mutate({ id: apiKey.id })}
                        >
                          CONFIRM REVOCATION
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed border-border/50 bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <KeyRound className="h-12 w-12 text-muted-foreground/30 mb-4" />
               <h3 className="text-xl font-semibold mb-2">No API keys yet</h3>
               <p className="text-muted-foreground max-w-sm">
                 Create a scoped key when you are ready to connect an internal tool or deployment workflow.
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* ── Developer Docs ── */}
      <motion.div variants={item}>
        <Card className="border-primary/20 bg-card/20 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-primary" /> Developer Documentation
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Use your API key to automate everything — deployments, bot management, payments & more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* ── Authentication ── */}
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Terminal className="h-4 w-4" /> Authentication
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Send your API key in <strong>one</strong> of these headers with every request:
              </p>
              <Tabs defaultValue="header">
                <TabsList className="h-8 bg-black/40">
                  <TabsTrigger value="header" className="text-xs font-mono">x-api-key</TabsTrigger>
                  <TabsTrigger value="bearer" className="text-xs font-mono">Authorization</TabsTrigger>
                  <TabsTrigger value="curl" className="text-xs font-mono">cURL example</TabsTrigger>
                  <TabsTrigger value="js" className="text-xs font-mono">JavaScript</TabsTrigger>
                  <TabsTrigger value="py" className="text-xs font-mono">Python</TabsTrigger>
                </TabsList>
                <TabsContent value="header">
                  <CodeBlock lang="http" code={`x-api-key: bh_your_api_key_here`} />
                </TabsContent>
                <TabsContent value="bearer">
                  <CodeBlock lang="http" code={`Authorization: Bearer bh_your_api_key_here`} />
                </TabsContent>
                <TabsContent value="curl">
                  <CodeBlock lang="bash" code={`curl ${apiBase}/deployments \\
  -H "x-api-key: bh_your_api_key_here"`} />
                </TabsContent>
                <TabsContent value="js">
                  <CodeBlock lang="javascript" code={`const API = "${apiBase}";
const KEY = "bh_your_api_key_here";

const res = await fetch(\`\${API}/deployments\`, {
  headers: { "x-api-key": KEY }
});
const deployments = await res.json();`} />
                </TabsContent>
                <TabsContent value="py">
                  <CodeBlock lang="python" code={`import requests

API = "${apiBase}"
KEY = "bh_your_api_key_here"
HEADERS = {"x-api-key": KEY}

r = requests.get(f"{API}/deployments", headers=HEADERS)
print(r.json())`} />
                </TabsContent>
              </Tabs>
            </div>

            {/* ── Scope table ── */}
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-3">Scopes</h3>
              <div className="rounded-lg border border-border/30 overflow-hidden text-sm">
                <div className="grid grid-cols-3 bg-white/5 px-4 py-2 text-xs font-mono text-muted-foreground uppercase">
                  <span>Scope</span><span>Can also use</span><span>What it allows</span>
                </div>
                {[
                  { scope: "read", color: "text-blue-400", implies: "—", what: "GET all resources (deployments, logs, metrics, payments)" },
                  { scope: "write", color: "text-green-400", implies: "read", what: "Deploy, start, stop, update env vars, check subscription expiry" },
                  { scope: "payments", color: "text-yellow-400", implies: "read", what: "Initiate M-Pesa STK push and subscribe to monthly plans" },
                ].map(row => (
                  <div key={row.scope} className="grid grid-cols-3 px-4 py-2 border-t border-border/20 items-center">
                    <Badge variant="outline" className={`w-fit text-[11px] font-mono ${row.color}`}>{row.scope}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{row.implies}</span>
                    <span className="text-xs text-muted-foreground">{row.what}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Endpoints ── */}
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-3">All Endpoints</h3>

              <p className="text-xs font-mono text-primary/60 mb-2 uppercase tracking-widest">Deployments</p>
              <div className="space-y-1.5 mb-4">
                <Endpoint method="GET" path="/api/deployments" scope="read"
                  description="List all your bot deployments."
                  responseExample={`[{ "id": 1, "botId": 1, "status": "running", "createdAt": "..." }]`} />
                <Endpoint method="POST" path="/api/deployments" scope="write"
                  description="Deploy a new bot. Requires an active subscription. Returns the new deployment."
                  body={`{ "botId": 1, "envVars": { "SESSION_ID": "Gifted~xxx..." } }`}
                  responseExample={`{ "id": 24, "status": "starting", "port": 3124 }`} />
                <Endpoint method="GET" path="/api/deployments/:id" scope="read"
                  description="Get full details for a specific deployment." />
                <Endpoint method="DELETE" path="/api/deployments/:id" scope="write"
                  description="Permanently delete a deployment and stop its bot process." />
                <Endpoint method="POST" path="/api/deployments/:id/start" scope="write"
                  description="Start a stopped bot." />
                <Endpoint method="POST" path="/api/deployments/:id/stop" scope="write"
                  description="Gracefully stop a running bot." />
                <Endpoint method="PUT" path="/api/deployments/:id/env" scope="write"
                  description="Update environment variables (SESSION_ID, OWNER_NUMBER, PREFIX etc)."
                  body={`{ "SESSION_ID": "Gifted~new_session_here", "OWNER_NUMBER": "254700000000" }`} />
                <Endpoint method="GET" path="/api/deployments/:id/logs" scope="read"
                  description="Fetch the last N log lines. Optional ?limit=200 query param."
                  responseExample={`[{ "level": "stdout", "message": "Connected", "timestamp": "..." }]`} />
                <Endpoint method="GET" path="/api/deployments/:id/metrics" scope="read"
                  description="Get CPU, memory, and uptime stats for a running bot." />
                <Endpoint method="GET" path="/api/deployments/:id/logs/export" scope="read"
                  description="Download all logs as a plain-text file." />
              </div>

              <p className="text-xs font-mono text-primary/60 mb-2 uppercase tracking-widest">Subscriptions</p>
              <div className="space-y-1.5 mb-4">
                <Endpoint method="GET" path="/api/subscriptions/status" scope="read"
                  description="Get your current subscription status and expiry." />
                <Endpoint method="GET" path="/api/payments/history" scope="read"
                  description="Get your payment transaction history." />
              </div>

              <p className="text-xs font-mono text-primary/60 mb-2 uppercase tracking-widest">Payments (M-Pesa)</p>
              <div className="space-y-1.5 mb-4">
                <Endpoint method="GET" path="/api/payments/plans" scope="read"
                  description="List available monthly subscription plans. No auth required." />
                <Endpoint method="POST" path="/api/payments/subscribe" scope="payments"
                  description="Initiate an M-Pesa STK push for a monthly subscription."
                  body={`{ "plan": "starter", "phone": "254712345678" }`}
                  responseExample={`{ "transactionId": 42, "status": "pending", "message": "STK push sent" }`} />
                <Endpoint method="GET" path="/api/payments/status/:id" scope="read"
                  description="Poll the status of an M-Pesa payment transaction."
                  responseExample={`{ "status": "completed", "subscriptionPlan": "starter" }`} />
                <Endpoint method="GET" path="/api/payments/history" scope="read"
                  description="Get all your past payment transactions." />
              </div>

              <p className="text-xs font-mono text-primary/60 mb-2 uppercase tracking-widest">Bots (public)</p>
              <div className="space-y-1.5">
                <Endpoint method="GET" path="/api/bots" scope="read"
                  description="List all available bot types you can deploy. No auth required." />
                <Endpoint method="GET" path="/api/bots/:id" scope="read"
                  description="Get details, required vars, and pricing for a specific bot type." />
              </div>
            </div>

            {/* ── Full example ── */}
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-3">Full Deploy Example</h3>
              <p className="text-sm text-muted-foreground mb-2">Deploy Atassa-MD, then poll until it's running:</p>
              <Tabs defaultValue="js2">
                <TabsList className="h-8 bg-black/40">
                  <TabsTrigger value="js2" className="text-xs font-mono">JavaScript</TabsTrigger>
                  <TabsTrigger value="py2" className="text-xs font-mono">Python</TabsTrigger>
                  <TabsTrigger value="curl2" className="text-xs font-mono">cURL</TabsTrigger>
                </TabsList>
                <TabsContent value="js2">
                  <CodeBlock lang="javascript" code={`const API  = "${apiBase}";
const KEY  = "bh_your_api_key_here";
const hdrs = { "x-api-key": KEY, "Content-Type": "application/json" };

// 1. Deploy the bot
const deploy = await fetch(\`\${API}/deployments\`, {
  method: "POST",
  headers: hdrs,
  body: JSON.stringify({
    botId: 1,                                       // 1 = Atassa-MD
    envVars: { SESSION_ID: "Gifted~your_session" }, // your session string
  }),
}).then(r => r.json());

console.log("Deployment ID:", deploy.id);

// 2. Poll until running (or failed)
let status = deploy.status;
while (status === "starting" || status === "installing") {
  await new Promise(r => setTimeout(r, 5000));
  const d = await fetch(\`\${API}/deployments/\${deploy.id}\`, { headers: hdrs }).then(r => r.json());
  status = d.status;
  console.log("Status:", status);
}

// 3. Check subscription status after deployment
const subscription = await fetch(\`\${API}/subscriptions/status\`, { headers: hdrs }).then(r => r.json());
console.log("Subscription expires:", subscription.expiresAt);`} />
                </TabsContent>
                <TabsContent value="py2">
                  <CodeBlock lang="python" code={`import requests, time

API   = "${apiBase}"
KEY   = "bh_your_api_key_here"
HDRS  = {"x-api-key": KEY, "Content-Type": "application/json"}

# 1. Deploy the bot
deploy = requests.post(f"{API}/deployments", headers=HDRS, json={
    "botId": 1,
    "envVars": {"SESSION_ID": "Gifted~your_session"}
}).json()
print("Deployment ID:", deploy["id"])

# 2. Poll until running
status = deploy["status"]
while status in ("starting", "installing"):
    time.sleep(5)
    d = requests.get(f"{API}/deployments/{deploy['id']}", headers=HDRS).json()
    status = d["status"]
    print("Status:", status)

# 3. Subscription status
subscription = requests.get(f"{API}/subscriptions/status", headers=HDRS).json()
print("Subscription expires:", subscription["expiresAt"])`} />
                </TabsContent>
                <TabsContent value="curl2">
                  <CodeBlock lang="bash" code={`# Deploy
curl -X POST ${apiBase}/deployments \\
  -H "x-api-key: bh_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"botId":1,"envVars":{"SESSION_ID":"Gifted~your_session"}}'

# Check status
curl ${apiBase}/deployments/24 \\
  -H "x-api-key: bh_your_api_key_here"

# Stop the bot
curl -X POST ${apiBase}/deployments/24/stop \\
  -H "x-api-key: bh_your_api_key_here"`} />
                </TabsContent>
              </Tabs>
            </div>

            {/* ── Error reference ── */}
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground mb-3">Error Responses</h3>
              <div className="rounded-lg border border-border/30 overflow-hidden text-sm">
                <div className="grid grid-cols-3 bg-white/5 px-4 py-2 text-xs font-mono text-muted-foreground uppercase">
                  <span>HTTP Code</span><span>Error</span><span>Cause</span>
                </div>
                {[
                  ["401", "Unauthorized", "Missing or invalid API key"],
                  ["401", "Invalid or expired API key", "Key revoked, or past expiry date"],
                  ["403", "API key missing required scope", "Key doesn't have the scope needed for this endpoint"],
                  ["402", "Subscription required", "An active subscription is required to deploy"],
                  ["404", "Deployment not found", "ID doesn't exist or belongs to another user"],
                  ["429", "Too many requests", "Rate limit hit — back off and retry"],
                ].map(([code, err, cause], i) => (
                  <div key={i} className="grid grid-cols-3 px-4 py-2 border-t border-border/20 items-start">
                    <span className={`font-mono text-xs font-bold ${code.startsWith("4") ? "text-red-400" : "text-muted-foreground"}`}>{code}</span>
                    <span className="font-mono text-xs text-foreground/70">{err}</span>
                    <span className="text-xs text-muted-foreground">{cause}</span>
                  </div>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
