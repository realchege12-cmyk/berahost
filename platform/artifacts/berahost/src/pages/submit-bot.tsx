import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Github, Send, CheckCircle, Clock, XCircle, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "approved") return <CheckCircle className="w-4 h-4 text-emerald-400" />;
  if (status === "rejected") return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-yellow-400" />;
};

export default function SubmitBotPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", description: "", repoUrl: "", platform: "whatsapp",
    sessionGuideUrl: "", sessionPrefix: "", startCommand: "",
  });
  const [requiredVars, setRequiredVars] = useState<{ key: string; desc: string }[]>([]);
  const [optionalVars, setOptionalVars] = useState<{ key: string; desc: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => apiFetch("/marketplace/submissions").then((r) => r.json()),
  });

  const submit = useMutation({
    mutationFn: (data: any) =>
      apiFetch("/marketplace/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Bot Submitted!", description: "Your bot will be reviewed within 24-48 hours." });
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["my-submissions"] });
    },
  });

  const requiredVarsObj = requiredVars.reduce((acc, v) => v.key ? { ...acc, [v.key]: v.desc } : acc, {});
  const optionalVarsObj = optionalVars.reduce((acc, v) => v.key ? { ...acc, [v.key]: v.desc } : acc, {});

  const handleSubmit = () => {
    submit.mutate({
      ...form,
      requiredVars: Object.keys(requiredVarsObj).length ? requiredVarsObj : null,
      optionalVars: Object.keys(optionalVarsObj).length ? optionalVarsObj : null,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">SUBMIT A BOT</h1>
        <p className="text-muted-foreground text-sm">Add your bot to the BERAHOST marketplace for everyone to deploy</p>
      </div>

      {submitted ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex flex-col items-center py-10 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
              <h3 className="font-mono font-bold text-lg mb-2">Bot Submitted!</h3>
              <p className="text-muted-foreground text-sm">Our team will review your submission within 24-48 hours. You'll be notified when it's approved.</p>
              <Button className="mt-6" variant="outline" onClick={() => setSubmitted(false)}>Submit Another Bot</Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Card className="border-white/10 bg-black/40">
          <CardHeader>
            <CardTitle className="font-mono text-base">Bot Details</CardTitle>
            <CardDescription>Fill in the information about your bot</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bot Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Awesome Bot" className="mt-1" />
              </div>
              <div>
                <Label>Platform *</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Description *</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe what your bot does..." className="mt-1" rows={3} />
            </div>

            <div>
              <Label>GitHub Repository URL *</Label>
              <Input value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/username/my-bot" className="mt-1 font-mono text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Session Guide URL</Label>
                <Input value={form.sessionGuideUrl} onChange={(e) => setForm({ ...form, sessionGuideUrl: e.target.value })}
                  placeholder="https://session.example.com" className="mt-1 text-sm" />
              </div>
              <div>
                <Label>Session Prefix</Label>
                <Input value={form.sessionPrefix} onChange={(e) => setForm({ ...form, sessionPrefix: e.target.value })}
                  placeholder="e.g. Gifted~" className="mt-1 font-mono" />
              </div>
            </div>

            <div>
              <Label>Start Command</Label>
              <Input value={form.startCommand} onChange={(e) => setForm({ ...form, startCommand: e.target.value })}
                placeholder="npm start" className="mt-1 font-mono" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Required Variables</Label>
                <Button size="sm" variant="outline" onClick={() => setRequiredVars([...requiredVars, { key: "", desc: "" }])}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {requiredVars.map((v, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input value={v.key} onChange={(e) => { const n = [...requiredVars]; n[i].key = e.target.value; setRequiredVars(n); }} placeholder="VAR_NAME" className="font-mono text-sm w-40" />
                  <Input value={v.desc} onChange={(e) => { const n = [...requiredVars]; n[i].desc = e.target.value; setRequiredVars(n); }} placeholder="Description" className="text-sm flex-1" />
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setRequiredVars(requiredVars.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Optional Variables</Label>
                <Button size="sm" variant="outline" onClick={() => setOptionalVars([...optionalVars, { key: "", desc: "" }])}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {optionalVars.map((v, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input value={v.key} onChange={(e) => { const n = [...optionalVars]; n[i].key = e.target.value; setOptionalVars(n); }} placeholder="VAR_NAME" className="font-mono text-sm w-40" />
                  <Input value={v.desc} onChange={(e) => { const n = [...optionalVars]; n[i].desc = e.target.value; setOptionalVars(n); }} placeholder="Description" className="text-sm flex-1" />
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setOptionalVars(optionalVars.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black" onClick={handleSubmit}
              disabled={!form.name || !form.description || !form.repoUrl || submit.isPending}>
              <Send className="w-4 h-4 mr-2" />
              {submit.isPending ? "Submitting..." : "Submit Bot for Review"}
            </Button>
          </CardContent>
        </Card>
      )}

      {(submissions as any[] || []).length > 0 && (
        <Card className="border-white/10 bg-black/40">
          <CardHeader>
            <CardTitle className="font-mono text-base">My Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {(submissions as any[]).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={s.status} />
                      <div>
                        <p className="font-mono text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[s.status] ?? ""}>{s.status}</Badge>
                      {s.adminNote && <span className="text-xs text-muted-foreground max-w-32 truncate">{s.adminNote}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
