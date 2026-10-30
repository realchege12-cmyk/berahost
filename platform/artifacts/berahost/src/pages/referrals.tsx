import { useState } from "react";
import { motion } from "framer-motion";
import { Gift, Copy, Users, ChevronRight, Send } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api${path}`, { credentials: "include", ...opts });

export default function ReferralsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["referrals"],
    queryFn: () => apiFetch("/referrals/my").then((r) => r.json()),
  });

  const applyCode = useMutation({
    mutationFn: (referralCode: string) =>
      apiFetch("/referrals/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode }) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "Referral Applied!", description: res.message });
      setCode("");
      qc.invalidateQueries({ queryKey: ["referrals"] });
    },
  });

  const copyLink = () => {
    if (data?.referralLink) {
      navigator.clipboard.writeText(data.referralLink);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">REFERRAL PROGRAM</h1>
        <p className="text-muted-foreground text-sm">Invite friends and grow the BERAHOST community</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <Gift className="w-8 h-8 text-cyan-400" />
            <div>
              <p className="text-xs text-muted-foreground">Your referral benefit</p>
              <p className="text-2xl font-bold font-mono text-cyan-400">Subscription credit</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <Users className="w-8 h-8 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Friend gets on signup</p>
              <p className="text-2xl font-bold font-mono text-emerald-400">Plan guidance</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <Card className="border-white/10 bg-black/40">
          <CardHeader>
            <CardTitle className="font-mono text-base">Your Referral Link</CardTitle>
            <CardDescription>Share this link and invite friends to choose a monthly hosting plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Referral Link</Label>
              <div className="flex gap-2 mt-1">
                <Input value={data?.referralLink ?? ""} readOnly className="font-mono text-xs" />
                <Button variant="outline" onClick={copyLink} className="shrink-0">
                  <Copy className="w-4 h-4 mr-2" />Copy
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Your Referral Code</Label>
              <div className="mt-1">
                <code className="text-lg font-mono font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-lg">{data?.referralCode}</code>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-white">{data?.totalReferrals ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Referrals</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-cyan-400">{data?.totalReferrals ?? 0}</p>
                <p className="text-xs text-muted-foreground">Plan Referrals</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-yellow-400">Active</p>
                <p className="text-xs text-muted-foreground">Referral status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-white/10 bg-black/40">
        <CardHeader>
          <CardTitle className="font-mono text-base">Have a Referral Code?</CardTitle>
          <CardDescription>Enter a friend's code to connect your account to the referral program.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ADMINBERA" className="font-mono" />
            <Button className="bg-cyan-500 hover:bg-cyan-400 text-black shrink-0" onClick={() => applyCode.mutate(code)} disabled={!code.trim() || applyCode.isPending}>
              <Send className="w-4 h-4 mr-2" />{applyCode.isPending ? "Applying..." : "Apply Code"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(data?.referrals ?? []).length > 0 && (
        <Card className="border-white/10 bg-black/40">
          <CardHeader>
            <CardTitle className="font-mono text-base">People You Referred</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data.referrals as any[]).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-mono text-cyan-400">
                      {r.email?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-mono">{r.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">Referred</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.createdAt), "MMM d")}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
