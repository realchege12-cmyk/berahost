import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, ArrowLeft, Ban, CheckCircle2, Shield, ShieldAlert,
  Search, MoreVertical, UserCheck, LogIn, KeyRound, Crown, AlertTriangle,
  Star, Skull, Copy, ChevronDown, Trash2
} from "lucide-react";
import { 
  useAdminListUsers, useAdminBanUser, useGetMe
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

const PLANS = ["free", "starter", "silver", "gold"];
const PLAN_COLORS: Record<string, string> = {
  free: "text-muted-foreground border-border/40",
  starter: "text-blue-400 border-blue-400/30",
  pro: "text-accent border-accent/30",
  business: "text-secondary border-secondary/30",
  gold: "text-yellow-400 border-yellow-400/30",
};

type ModalType = "plan" | "reset-password" | "abuse-flag" | null;

export default function AdminUsers() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: users, isLoading, refetch } = useAdminListUsers();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modal, setModal] = useState<ModalType>(null);

  // Plan override state
  const [newPlan, setNewPlan] = useState("free");
  const [planReason, setPlanReason] = useState("");

  // Reset password state
  const [newPassword, setNewPassword] = useState("");

  // Abuse flag state
  const [abuseNote, setAbuseNote] = useState("");

  const banMutation = useAdminBanUser({
    mutation: {
      onSuccess: () => { toast({ title: "Status Updated" }); refetch(); },
      onError: (err) => toast({ title: "Error", description: (err as any).error || "Failed", variant: "destructive" }),
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/users/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: "User deleted", description: d.message }); refetch(); },
    onError: (err: any) => toast({ title: "Delete failed", description: err.error || "Unable to delete user", variant: "destructive" }),
  });

  const planMutation = useMutation({
    mutationFn: ({ id, plan, reason }: { id: number; plan: string; reason: string }) =>
      apiFetch(`/admin/users/${id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, reason, expiresAt: plan === "free" ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }) }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: "Plan Updated", description: d.message }); closeModal(); refetch(); },
    onError: () => toast({ title: "Error", description: "Plan override failed", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/users/${id}/verify`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: "Verified", description: d.message }); refetch(); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      apiFetch(`/admin/users/${id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword }) }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: "Password Reset", description: d.message }); closeModal(); },
    onError: () => toast({ title: "Error", description: "Password reset failed", variant: "destructive" }),
  });

  const abuseMutation = useMutation({
    mutationFn: ({ id, flag, note }: { id: number; flag: boolean; note: string }) =>
      apiFetch(`/admin/users/${id}/abuse-flag`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flag, note }) }).then(r => r.json()),
    onSuccess: (d) => { toast({ title: "Abuse Flag Updated", description: d.message }); closeModal(); refetch(); },
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/users/${id}/impersonate`, { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: "Impersonating User", description: d.message });
      qc.invalidateQueries({ queryKey: ["getMe"] });
      setLocation("/dashboard");
    },
    onError: (err: any) => toast({ title: "Error", description: err.error || "Impersonation failed", variant: "destructive" }),
  });

  if (user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  const openModal = (type: ModalType, u: any) => {
    setSelectedUser(u);
    setModal(type);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
    setNewPlan("free"); setPlanReason("");
    setNewPassword(""); setAbuseNote("");
  };

  const filtered = users?.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.phone && u.phone.includes(searchTerm))
  ) || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> USER MANAGEMENT
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Full control — ban, verify, impersonate, override plans, delete users, reset passwords
          </p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 bg-background/50 font-mono text-xs border-border/50"
            />
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            {filtered.length} of {users?.length ?? 0} users
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="rounded-md border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader className="bg-background/50">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs font-bold uppercase">User</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Plan</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Expires</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Status</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Joined</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length > 0 ? filtered.map((u) => (
                    <TableRow key={u.id} className="border-border/50 hover:bg-white/5 transition-colors group">
                      <TableCell>
                        <div className="font-medium text-sm">{u.email}</div>
                        <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                          #{u.id}
                          {u.isAdmin && <Badge className="ml-1 h-4 text-[9px] bg-primary/20 text-primary border-primary/30">ADMIN</Badge>}
                          {(u as any).abuseFlag && <Badge className="ml-1 h-4 text-[9px] bg-destructive/20 text-destructive border-destructive/30">⚠ ABUSE</Badge>}
                          {!u.isVerified && <Badge className="ml-1 h-4 text-[9px] bg-yellow-500/10 text-yellow-500 border-yellow-500/20">UNVERIFIED</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase ${PLAN_COLORS[u.subscriptionPlan] || "text-muted-foreground"}`}>
                          {u.subscriptionPlan === "enterprise" && <Star className="h-2.5 w-2.5 mr-1" />}
                          {u.subscriptionPlan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{u.subscriptionExpiresAt ? format(new Date(u.subscriptionExpiresAt), "MMM d, yyyy") : "—"}</TableCell>
                      <TableCell>
                        {u.isBanned ? (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono text-[10px]">BANNED</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 font-mono text-[10px]">ACTIVE</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {format(new Date(u.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-xl border-border/50 font-mono text-xs w-52">
                            <DropdownMenuLabel className="font-mono text-[10px] text-muted-foreground uppercase">
                              {u.email}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-border/50" />
                            
                            <DropdownMenuItem onClick={() => openModal("plan", u)} className="cursor-pointer text-secondary focus:text-secondary focus:bg-secondary/10">
                              <Crown className="mr-2 h-3 w-3" /> Override Plan
                            </DropdownMenuItem>

                            {!u.isAdmin && (
                              <DropdownMenuItem
                                onClick={() => impersonateMutation.mutate(u.id)}
                                className="cursor-pointer text-accent focus:text-accent focus:bg-accent/10"
                              >
                                <LogIn className="mr-2 h-3 w-3" /> Impersonate User
                              </DropdownMenuItem>
                            )}

                            {!u.isVerified && (
                              <DropdownMenuItem onClick={() => verifyMutation.mutate(u.id)} className="cursor-pointer text-accent focus:text-accent focus:bg-accent/10">
                                <UserCheck className="mr-2 h-3 w-3" /> Force Verify
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem onClick={() => openModal("reset-password", u)} className="cursor-pointer text-primary focus:text-primary focus:bg-primary/10">
                              <KeyRound className="mr-2 h-3 w-3" /> Reset Password
                            </DropdownMenuItem>

                            <DropdownMenuSeparator className="bg-border/50" />

                            <DropdownMenuItem
                              onClick={() => openModal("abuse-flag", u)}
                              className={`cursor-pointer ${(u as any).abuseFlag ? "text-accent focus:text-accent focus:bg-accent/10" : "text-orange-400 focus:text-orange-400 focus:bg-orange-400/10"}`}
                            >
                              <Skull className="mr-2 h-3 w-3" /> {(u as any).abuseFlag ? "Clear Abuse Flag" : "Flag for Abuse"}
                            </DropdownMenuItem>

                            {!u.isAdmin && (
                              <DropdownMenuItem
                                onClick={() => banMutation.mutate({ id: u.id, data: { banned: !u.isBanned, reason: "Admin action" } })}
                                className={`cursor-pointer ${u.isBanned ? "text-accent focus:text-accent focus:bg-accent/10" : "text-destructive focus:text-destructive focus:bg-destructive/10"}`}
                              >
                                {u.isBanned ? <><CheckCircle2 className="mr-2 h-3 w-3" /> Unban User</> : <><Ban className="mr-2 h-3 w-3" /> Ban User</>}
                              </DropdownMenuItem>
                            )}

                            {!u.isAdmin && (
                              <DropdownMenuItem
                                onClick={() => { if (window.confirm(`Delete ${u.email}? Their hosting will be stopped and the account will be soft-deleted.`)) deleteMutation.mutate(u.id); }}
                                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <Trash2 className="mr-2 h-3 w-3" /> Delete User
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono text-sm">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PLAN DIALOG */}
      <Dialog open={modal === "plan"} onOpenChange={closeModal}>
        <DialogContent className="border-secondary/30 bg-card/95 backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-secondary flex items-center gap-2">
              <Crown className="h-5 w-5" /> OVERRIDE SUBSCRIPTION PLAN
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{selectedUser?.email} — currently on <strong>{selectedUser?.subscriptionPlan}</strong></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">New Plan</label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="bg-background/50 font-mono border-secondary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card/95 border-border/50 font-mono">
                  {PLANS.map(p => (
                    <SelectItem key={p} value={p} className="font-mono text-xs capitalize">{p.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">Reason (audit log)</label>
              <Input placeholder="e.g. Promotional upgrade" value={planReason} onChange={(e) => setPlanReason(e.target.value)}
                className="bg-background/50 font-mono border-secondary/30" />
            </div>
            <Button className="w-full font-mono bg-secondary hover:bg-secondary/90 text-primary-foreground"
              onClick={() => planMutation.mutate({ id: selectedUser.id, plan: newPlan, reason: planReason })}
              disabled={planMutation.isPending || !planReason}>
              {planMutation.isPending ? "Updating..." : "OVERRIDE PLAN"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* RESET PASSWORD DIALOG */}
      <Dialog open={modal === "reset-password"} onOpenChange={closeModal}>
        <DialogContent className="border-primary/30 bg-card/95 backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-primary flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> RESET PASSWORD
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">New Password (min. 6 chars)</label>
              <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="bg-background/50 font-mono border-primary/30" />
            </div>
            <Button className="w-full font-mono bg-primary hover:bg-primary/90"
              onClick={() => resetPasswordMutation.mutate({ id: selectedUser.id, newPassword })}
              disabled={resetPasswordMutation.isPending || newPassword.length < 6}>
              {resetPasswordMutation.isPending ? "Resetting..." : "RESET PASSWORD"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ABUSE FLAG DIALOG */}
      <Dialog open={modal === "abuse-flag"} onOpenChange={closeModal}>
        <DialogContent className="border-orange-500/30 bg-card/95 backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-orange-400 flex items-center gap-2">
              <Skull className="h-5 w-5" /> {selectedUser?.abuseFlag ? "CLEAR ABUSE FLAG" : "FLAG FOR ABUSE"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">Note / Reason</label>
              <Textarea placeholder="Describe the abuse..." value={abuseNote} onChange={(e) => setAbuseNote(e.target.value)}
                className="bg-background/50 font-mono border-orange-500/30 min-h-[80px]" />
            </div>
            <Button className={`w-full font-mono ${selectedUser?.abuseFlag ? "bg-accent hover:bg-accent/90" : "bg-orange-500 hover:bg-orange-500/90 text-black"}`}
              onClick={() => abuseMutation.mutate({ id: selectedUser.id, flag: !selectedUser.abuseFlag, note: abuseNote })}
              disabled={abuseMutation.isPending}>
              {abuseMutation.isPending ? "Saving..." : selectedUser?.abuseFlag ? "CLEAR FLAG" : "MARK AS ABUSER"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
