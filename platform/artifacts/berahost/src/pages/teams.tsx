import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Copy, Trash2, Crown, RefreshCw, UserPlus, Shield } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

export default function TeamsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiFetch("/teams").then((r) => r.json()),
  });

  const createTeam = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Team Created!", description: `Invite code: ${data.inviteCode}` });
      qc.invalidateQueries({ queryKey: ["teams"] });
      setCreateOpen(false);
      setTeamName("");
    },
  });

  const joinTeam = useMutation({
    mutationFn: (code: string) =>
      apiFetch("/teams/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteCode: code }) }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Joined Team!", description: data.message });
      qc.invalidateQueries({ queryKey: ["teams"] });
      setJoinOpen(false);
      setInviteCode("");
    },
  });

  const regenInvite = useMutation({
    mutationFn: (teamId: number) =>
      apiFetch(`/teams/${teamId}/regenerate-invite`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "New Invite Code", description: data.inviteCode });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const removeMember = useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: number; memberId: number }) =>
      apiFetch(`/teams/${teamId}/members/${memberId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Member removed" });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: "Invite code copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">TEAM ACCOUNTS</h1>
          <p className="text-muted-foreground text-sm">Manage bots together — one account, multiple operators</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setJoinOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />Join Team
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black">
            <Plus className="w-4 h-4 mr-2" />Create Team
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
      ) : !teams?.length ? (
        <Card className="border-dashed border-cyan-500/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-cyan-500/50 mb-4" />
            <h3 className="font-mono font-bold text-lg mb-2">No Teams Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">Create a team to collaborate with others on bot deployments</p>
            <Button onClick={() => setCreateOpen(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black">
              <Plus className="w-4 h-4 mr-2" />Create Your First Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(teams as any[]).map((team: any) => (
            <motion.div key={team.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-white/10 bg-black/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                        <Users className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <CardTitle className="font-mono flex items-center gap-2">
                          {team.name}
                          {team.isOwner && <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Owner</Badge>}
                        </CardTitle>
                        <CardDescription>{team.members?.length ?? 0} member(s)</CardDescription>
                      </div>
                    </div>
                    {team.isOwner && team.inviteCode && (
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{team.inviteCode}</code>
                        <Button size="icon" variant="ghost" onClick={() => copyCode(team.inviteCode)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => regenInvite.mutate(team.id)}>
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(team.members || []).map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-mono text-cyan-400">
                            {m.email?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="text-sm font-mono">{m.email}</span>
                          {m.role === "owner" && <Crown className="w-3 h-3 text-yellow-400" />}
                        </div>
                        <div className="flex items-center gap-2">
                          {m.canDeploy && <Badge variant="outline" className="text-xs">Deploy</Badge>}
                          {m.canManageBilling && <Badge variant="outline" className="text-xs">Billing</Badge>}
                          {team.isOwner && m.role !== "owner" && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => removeMember.mutate({ teamId: team.id, memberId: m.id })}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-black border-white/10">
          <DialogHeader>
            <DialogTitle className="font-mono">Create Team</DialogTitle>
            <DialogDescription>Create a team to manage bots together with your colleagues</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Team Name</Label>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My Bot Crew" className="mt-1" />
            </div>
            <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black" onClick={() => createTeam.mutate(teamName)} disabled={!teamName.trim() || createTeam.isPending}>
              {createTeam.isPending ? "Creating..." : "Create Team"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="bg-black border-white/10">
          <DialogHeader>
            <DialogTitle className="font-mono">Join a Team</DialogTitle>
            <DialogDescription>Enter the invite code shared by the team owner</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Invite Code</Label>
              <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC123" className="mt-1 font-mono" />
            </div>
            <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black" onClick={() => joinTeam.mutate(inviteCode)} disabled={!inviteCode.trim() || joinTeam.isPending}>
              {joinTeam.isPending ? "Joining..." : "Join Team"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
