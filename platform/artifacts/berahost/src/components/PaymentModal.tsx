import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Smartphone, Star, X, XCircle, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) => fetch(`${BASE}api${path}`, { credentials: "include", ...opts });
export type PaymentMode = { type: "subscription"; planId: string; name: string; kes: number };
interface PaymentModalProps { open: boolean; onClose: () => void; mode: PaymentMode | null; }
type Step = "phone" | "pending" | "success" | "failed";
const MAX_WAIT_SECS = 300;

export function PaymentModal({ open, onClose, mode }: PaymentModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [txnId, setTxnId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPhone(""); setStep("phone"); setTxnId(null); setElapsed(0); } }, [open]);
  useEffect(() => { if (step !== "pending") return; const timer = setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [step]);
  const { data: status, refetch } = useQuery({ queryKey: ["payment-status", txnId], queryFn: () => apiFetch(`/payments/status/${txnId}`).then((r) => r.json()), enabled: step === "pending" && !!txnId, refetchInterval: 3000 });
  useEffect(() => { if (step !== "pending" || !status) return; if (status.status === "success") { setStep("success"); qc.invalidateQueries({ queryKey: ["getMe"] }); qc.invalidateQueries({ queryKey: ["getSubscriptionStatus"] }); } else if (status.status === "failed" || elapsed >= MAX_WAIT_SECS) setStep("failed"); }, [status, step, elapsed, qc]);
  if (!mode) return null;
  const pay = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      const response = await apiFetch("/payments/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone.trim(), plan: mode.planId }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Payment could not be started");
      setTxnId(data.transactionId); setStep("pending");
    } catch (error: any) { toast({ title: "Payment error", description: error.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}><DialogContent className="max-w-md border-primary/30 bg-card/95"><DialogHeader><DialogTitle className="flex items-center gap-2 text-primary"><CreditCard className="h-5 w-5" /> Subscribe with M-Pesa</DialogTitle><DialogDescription>Secure PayHero STK Push. Subscriptions are billed monthly.</DialogDescription></DialogHeader>
    {step === "phone" && <div className="space-y-5"><div className="rounded-xl border border-primary/20 bg-background/30 p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Plan</span><Badge variant="outline" className="uppercase text-primary">{mode.name}</Badge></div><div className="mt-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Monthly price</span><strong className="text-2xl">KES {mode.kes}</strong></div></div><div className="space-y-2"><label className="flex items-center gap-1 text-xs uppercase text-muted-foreground"><Smartphone className="h-3 w-3" /> M-Pesa phone number</label><Input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX or 254..." onKeyDown={(e) => e.key === "Enter" && pay()} /></div><Button className="w-full" disabled={busy || phone.trim().length < 9} onClick={pay}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />} Pay KES {mode.kes}</Button></div>}
    {step === "pending" && <div className="space-y-5 py-6 text-center"><Smartphone className="mx-auto h-14 w-14 text-primary" /><h3 className="text-xl font-bold">Check your phone</h3><p className="text-sm text-muted-foreground">Enter your M-Pesa PIN to activate {mode.name}. Waiting for confirmation ({Math.max(0, MAX_WAIT_SECS - elapsed)}s).</p><p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/80">Changed your mind? You can close this window. Closing stops the status screen; it does not reverse an M-Pesa prompt that was already sent.</p><div className="flex gap-2"><Button className="flex-1" variant="outline" onClick={() => refetch()}>Check payment status</Button><Button className="flex-1" variant="ghost" onClick={onClose}><X className="mr-2 h-4 w-4" /> Close window</Button></div></div>}
    {step === "success" && <div className="space-y-5 py-6 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-accent" /><h3 className="text-xl font-bold text-accent">Subscription active</h3><p className="text-sm text-muted-foreground">Your {mode.name} plan has been activated for 30 days.</p><Button className="w-full" onClick={onClose}><Star className="mr-2 h-4 w-4" /> Continue</Button></div>}
    {step === "failed" && <div className="space-y-5 py-6 text-center"><XCircle className="mx-auto h-16 w-16 text-destructive" /><h3 className="text-xl font-bold text-destructive">Payment not confirmed</h3><p className="text-sm text-muted-foreground">If M-Pesa charged you, the subscription will activate automatically when PayHero confirms it.</p><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setStep("phone")}><AlertCircle className="mr-2 h-4 w-4" /> Try again</Button><Button className="flex-1" onClick={onClose}>Close</Button></div></div>}
  </DialogContent></Dialog>;
}
