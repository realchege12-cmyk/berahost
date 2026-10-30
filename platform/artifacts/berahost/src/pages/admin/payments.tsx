import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CreditCard, CheckCircle2, Clock, XCircle,
  Zap, Phone, Package, RefreshCw, AlertTriangle, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  success: { label: "Success",  color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  pending: { label: "Pending",  color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",   icon: Clock },
  failed:  { label: "Failed",   color: "bg-red-500/20 text-red-400 border-red-500/30",             icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, color: "bg-muted/30 text-muted-foreground border-border", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`font-mono text-[10px] flex items-center gap-1 ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </Badge>
  );
}

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [confirmTxn, setConfirmTxn] = useState<any>(null);

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ["admin", "payments"],
    queryFn: () => apiFetch("/admin/payments").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const forceCredit = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/payments/${id}/force-credit`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Payment Updated", description: data.message });
        qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      }
      setConfirmTxn(null);
    },
    onError: () => toast({ title: "Error", description: "Force credit failed", variant: "destructive" }),
  });

  const txns: any[] = Array.isArray(transactions) ? transactions : [];

  const filtered = txns.filter(t => {
    if (tab !== "all" && t.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        String(t.phone).includes(q) ||
        String(t.id).includes(q) ||
        (t.payheroTxnId ?? "").toLowerCase().includes(q) ||
        (t.package ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totals = {
    all:     txns.length,
    success: txns.filter(t => t.status === "success").length,
    pending: txns.filter(t => t.status === "pending").length,
    failed:  txns.filter(t => t.status === "failed").length,
  };

  const totalRevenue = txns
    .filter(t => t.status === "success")
    .reduce((s, t) => s + Number(t.amountKes || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-emerald-400" /> PAYMENT TRANSACTIONS
          </h1>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">All M-Pesa / PayHero transactions — last 100</p>
        </div>
        <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue",  value: `KES ${totalRevenue.toLocaleString()}`, icon: CreditCard, color: "text-emerald-400" },
          { label: "Successful",     value: totals.success,  icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Pending",        value: totals.pending,  icon: Clock,        color: "text-yellow-400" },
          { label: "Failed",         value: totals.failed,   icon: XCircle,      color: "text-red-400"    },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-white/10 bg-black/40">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-[10px] font-mono text-muted-foreground uppercase">{label}</span>
              </div>
              <p className={`text-xl font-black font-mono mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={tab} onValueChange={setTab} className="flex-shrink-0">
          <TabsList className="font-mono text-xs">
            <TabsTrigger value="all">All ({totals.all})</TabsTrigger>
            <TabsTrigger value="success">Success ({totals.success})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({totals.pending})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({totals.failed})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search phone, txn ID, package..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 font-mono text-xs h-9 bg-background/50"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <Card className="border-white/10 bg-black/40">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-sm text-muted-foreground">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="w-10 h-10 text-muted-foreground opacity-20 mb-3" />
              <p className="font-mono text-muted-foreground text-sm">No transactions found</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {/* Table header */}
              <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 text-[10px] font-mono text-muted-foreground uppercase">
                <span>#</span>
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3" /> Package</span>
                <span>Amount</span>
                <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Payment</span>
                <span>Date</span>
                <span>Status</span>
              </div>
              {filtered.map((txn: any) => (
                <div
                  key={txn.id}
                  className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-[10px] font-mono text-muted-foreground">#{txn.id}</span>
                  <span className="font-mono text-xs text-foreground">{txn.phone}</span>
                  <span className="font-mono text-xs">
                    <Badge variant="outline" className="text-[10px] border-white/10 font-mono">
                      {txn.package?.startsWith("sub:") ? `Sub: ${txn.package.replace("sub:","")}` : txn.package || "—"}
                    </Badge>
                  </span>
                  <span className="font-mono text-xs text-emerald-400 font-bold">
                    KES {Number(txn.amountKes || 0).toLocaleString()}
                  </span>
                  <span className="font-mono text-xs text-yellow-400">
                    {txn.paymentAwarded > 0 ? `+${txn.paymentAwarded}` : "—"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {txn.createdAt ? format(new Date(txn.createdAt), "MMM d, HH:mm") : "—"}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={txn.status} />
                    {txn.status !== "success" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] font-mono px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => setConfirmTxn(txn)}
                      >
                        <Zap className="w-3 h-3 mr-1" /> Force Credit
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Force Credit Confirmation Dialog */}
      <Dialog open={!!confirmTxn} onOpenChange={o => !o && setConfirmTxn(null)}>
        <DialogContent className="bg-black border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-5 w-5" /> Force Confirm Payment?
            </DialogTitle>
            <DialogDescription className="text-sm">
              This will manually mark transaction <span className="font-mono text-foreground">#{confirmTxn?.id}</span> as
              successful and award <span className="font-mono text-yellow-400">{confirmTxn?.paymentAwarded} payment</span> to
              user <span className="font-mono text-foreground">#{confirmTxn?.userId}</span>.
              Use only when M-Pesa charged the user but the callback failed.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/20 rounded-lg p-3 font-mono text-xs space-y-1 border border-white/10">
            <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{confirmTxn?.phone}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="text-emerald-400">KES {confirmTxn?.amountKes}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Package</span><span>{confirmTxn?.package}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-yellow-400">{confirmTxn?.status}</span></div>
            {confirmTxn?.payheroTxnId && (
              <div className="flex justify-between"><span className="text-muted-foreground">PayHero Ref</span><span className="text-xs">{confirmTxn.payheroTxnId}</span></div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmTxn(null)} className="font-mono text-xs">Cancel</Button>
            <Button
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-mono text-xs"
              onClick={() => forceCredit.mutate(confirmTxn.id)}
              disabled={forceCredit.isPending}
            >
              <Zap className="w-3 h-3 mr-1" />
              {forceCredit.isPending ? "Crediting..." : "Confirm Force Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
