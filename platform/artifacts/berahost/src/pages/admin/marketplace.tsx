import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, CheckCircle, XCircle, Clock, Github, Eye, MessageSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function AdminMarketplacePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("pending");

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["admin-marketplace", tab],
    queryFn: () => apiFetch(`/admin/marketplace/submissions?status=${tab}`).then((r) => r.json()),
  });

  const approve = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote: string }) =>
      apiFetch(`/admin/marketplace/submissions/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminNote }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Bot Approved!", description: "It is now live in the marketplace." });
      qc.invalidateQueries({ queryKey: ["admin-marketplace"] });
      setSelected(null); setNote("");
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote: string }) =>
      apiFetch(`/admin/marketplace/submissions/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminNote }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Bot Rejected", description: "Submitter has been notified." });
      qc.invalidateQueries({ queryKey: ["admin-marketplace"] });
      setSelected(null); setNote("");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">MARKETPLACE REVIEW</h1>
        <p className="text-muted-foreground text-sm">Approve or reject bot submissions from users</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        {["pending", "approved", "rejected"].map((t) => (
          <TabsContent key={t} value={t}>
            {isLoading ? (
              <div className="space-y-3 mt-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : !(submissions as any[])?.length ? (
              <Card className="border-dashed border-white/20 mt-4">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="w-10 h-10 text-muted-foreground opacity-30 mb-3" />
                  <p className="font-mono text-muted-foreground">No {t} submissions</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {(submissions as any[]).map((s: any) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-white/10 bg-black/40 hover:border-white/20 transition-colors">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-mono font-bold">{s.name}</h3>
                              <Badge className={statusColors[s.status] ?? ""}>{s.status}</Badge>
                              <Badge variant="outline" className="text-xs">{s.platform}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{s.description}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Github className="w-3 h-3" />{s.repoUrl?.replace(/https?:\/\/[^@]*@github\.com\//, "").replace("https://github.com/", "")}</span>
                              <span>by {s.submittedByEmail}</span>
                              <span>{format(new Date(s.createdAt), "MMM d, yyyy")}</span>
                            </div>
                            {s.adminNote && (
                              <p className="text-xs text-muted-foreground mt-1 italic">Note: {s.adminNote}</p>
                            )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => { setSelected(s); setNote(""); }}>
                            <Eye className="w-3 h-3 mr-1" />Review
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-black border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.platform} bot by {selected?.submittedByEmail}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm mt-1">{selected.description}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Repository</Label>
                <p className="text-sm text-cyan-400 mt-1 flex items-center gap-1 font-mono">
                  <Github className="w-3 h-3 shrink-0" />
                  {selected.repoUrl?.replace(/https?:\/\/[^@]*@github\.com\//, "").replace("https://github.com/", "") || "—"}
                </p>
              </div>
              {selected.requiredVars && (
                <div>
                  <Label className="text-xs text-muted-foreground">Required Variables</Label>
                  <div className="mt-1 space-y-1">
                    {Object.entries(selected.requiredVars).map(([k, v]: [string, any]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <code className="bg-muted/30 px-1 rounded">{k}</code>
                        <span className="text-muted-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Admin Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Leave a note for the submitter..." className="mt-1 text-sm" rows={3} />
              </div>
              {selected.status === "pending" && (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black"
                    onClick={() => approve.mutate({ id: selected.id, adminNote: note })} disabled={approve.isPending}>
                    <CheckCircle className="w-4 h-4 mr-2" />{approve.isPending ? "Approving..." : "Approve"}
                  </Button>
                  <Button className="flex-1" variant="destructive"
                    onClick={() => reject.mutate({ id: selected.id, adminNote: note })} disabled={reject.isPending}>
                    <XCircle className="w-4 h-4 mr-2" />{reject.isPending ? "Rejecting..." : "Reject"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
