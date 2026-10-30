import { useState } from "react";
import { motion } from "framer-motion";
import { Github, Plus, Trash2, Copy, Zap, Globe, GitBranch, Clock, ExternalLink } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

export default function GithubIntegrationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ deploymentId: "", repoUrl: "", branch: "main" });

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["github-webhooks"],
    queryFn: () => apiFetch("/github/webhooks").then((r) => r.json()),
  });

  const { data: deployments } = useQuery({
    queryKey: ["deployments"],
    queryFn: () => apiFetch("/deployments").then((r) => r.json()),
  });

  const create = useMutation({
    mutationFn: (data: any) =>
      apiFetch("/github/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Webhook Created!", description: "Add the URL to your GitHub repo settings." });
      qc.invalidateQueries({ queryKey: ["github-webhooks"] });
      setOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/github/webhooks/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Webhook removed" });
      qc.invalidateQueries({ queryKey: ["github-webhooks"] });
    },
  });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Webhook URL copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">GITHUB AUTO-DEPLOY</h1>
          <p className="text-muted-foreground text-sm">Connect your GitHub repo — auto-redeploy on every push</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black">
          <Plus className="w-4 h-4 mr-2" />Connect Repo
        </Button>
      </div>

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Github className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-cyan-400 mb-1">How it works</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Connect a deployment to a GitHub repository</li>
                <li>Copy the webhook URL below</li>
                <li>Add it to your GitHub repo → Settings → Webhooks → Add webhook</li>
                <li>On every push to your branch, the bot automatically restarts with the latest code</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : !webhooks?.length ? (
        <Card className="border-dashed border-white/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Github className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
            <h3 className="font-mono font-bold mb-2">No Webhooks Yet</h3>
            <p className="text-sm text-muted-foreground mb-6">Connect a deployment to auto-deploy on every GitHub push</p>
            <Button onClick={() => setOpen(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black">
              <Plus className="w-4 h-4 mr-2" />Connect First Repo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(webhooks as any[]).map((hook: any) => (
            <motion.div key={hook.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-white/10 bg-black/40">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-mono text-base flex items-center gap-2">
                        <Github className="w-4 h-4" />
                        {hook.repoUrl.replace("https://github.com/", "")}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <GitBranch className="w-3 h-3" />
                        {hook.branch}
                        {hook.isEnabled ? (
                          <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>
                        ) : (
                          <Badge className="text-xs" variant="secondary">Disabled</Badge>
                        )}
                      </CardDescription>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove.mutate(hook.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook URL (copy to GitHub)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-xs bg-muted/30 px-3 py-2 rounded font-mono truncate">{hook.webhookUrl}</code>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copyUrl(hook.webhookUrl)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook Secret</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-xs bg-muted/30 px-3 py-2 rounded font-mono truncate">{hook.webhookSecret}</code>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copyUrl(hook.webhookSecret)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {hook.lastTriggeredAt && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Last triggered: {format(new Date(hook.lastTriggeredAt), "MMM d, HH:mm")}
                      {hook.lastCommitMsg && <span className="truncate max-w-xs">— {hook.lastCommitMsg}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-black border-white/10">
          <DialogHeader>
            <DialogTitle className="font-mono">Connect GitHub Repo</DialogTitle>
            <DialogDescription>Auto-redeploy your bot whenever you push to GitHub</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Deployment</Label>
              <Select onValueChange={(v) => setForm({ ...form, deploymentId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select deployment" />
                </SelectTrigger>
                <SelectContent>
                  {(deployments as any[] || []).map((dep: any) => (
                    <SelectItem key={dep.id} value={String(dep.id)}>
                      {dep.bot?.name ?? "Bot"} #{dep.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Repository URL</Label>
              <Input value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/username/my-bot" className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label>Branch</Label>
              <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="main" className="mt-1 font-mono" />
            </div>
            <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black"
              onClick={() => create.mutate({ deploymentId: parseInt(form.deploymentId), repoUrl: form.repoUrl, branch: form.branch })}
              disabled={!form.deploymentId || !form.repoUrl || create.isPending}>
              {create.isPending ? "Connecting..." : "Connect Repository"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
