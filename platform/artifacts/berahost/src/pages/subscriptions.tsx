import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  ShieldCheck, CheckCircle2, Server, Zap, X, CreditCard, Star
} from "lucide-react";
import { useGetSubscriptionStatus, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PaymentModal, PaymentMode } from "@/components/PaymentModal";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;
const fetchPlans = async () => {
  const response = await fetch(`${BASE}api/subscriptions/plans`);
  if (!response.ok) throw new Error("Unable to load plans");
  return response.json() as Promise<Array<{id:string;name:string;priceKes:number;maxBots:number;maxWebApps:number;features:string[]}>>;
};

export default function SubscriptionsPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: status, isLoading: statusLoading } = useGetSubscriptionStatus();
  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery({ queryKey: ["subscription-plans"], queryFn: fetchPlans });
  const qc = useQueryClient();

  const [payMode, setPayMode] = useState<PaymentMode | null>(null);

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  if (statusLoading || userLoading || plansLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 mb-2" /><Skeleton className="h-5 w-96" />
        <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5 mt-8">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-[480px] w-full" />)}
        </div>
      </div>
    );
  }

  const currentPlan = user?.subscriptionPlan || "free";
  if (plansError) return <div className="text-center py-12 text-destructive">Unable to load subscription plans. Please try again.</div>;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="text-center max-w-2xl mx-auto mb-4">
           <Badge variant="outline" className="mb-4 bg-primary/10 text-primary border-primary/30">
             <ShieldCheck className="mr-2 h-3 w-3" /> Plans for growing teams
        </Badge>
           <h1 className="page-title mb-4">
             Choose the right operating capacity
        </h1>
           <p className="text-muted-foreground text-sm leading-6">
             Start small and add room for more deployments when your team needs it. Paid plans activate through M-Pesa STK Push.
        </p>
      </motion.div>

      <motion.div variants={item}>
        <Card className="border-amber-500/30 bg-amber-500/[0.05]">
          <CardContent className="flex items-start gap-3 p-4">
            <Server className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-foreground">Constrained hosting pilot</p>
              <p className="mt-1">All customer bot and web workloads currently share a platform-wide ceiling of 256 MB RAM and 100% CPU (one vCPU total). This is below the per-plan limits shown here; builds and services may be throttled or stopped when the shared pool is exhausted. Deployment files are on the container filesystem, not a persistent Docker volume, so use an external database/object store for important data.</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Current plan banner */}
      {currentPlan !== "free" && (
        <motion.div variants={item}>
          <Card className="border-accent/30 bg-accent/5 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-accent" />
                </div>
                <div>
                   <h3 className="text-base font-semibold text-accent">Active plan: {currentPlan}</h3>
                  <p className="text-xs font-mono text-muted-foreground">
                    {status?.expiresAt ? `Renews: ${new Date(status.expiresAt).toLocaleDateString()}` : "Active subscription"}
                  </p>
                </div>
              </div>
                 <Badge className="bg-accent/20 text-accent border-none">
                   <Star className="mr-1.5 h-3 w-3 fill-current" /> Active subscriber
              </Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div variants={item} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isPopular = plan.id === "silver";
          const isFree = plan.id === "free";

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col h-full overflow-hidden transition-all duration-300 ${
                isCurrent
                  ? "border-accent bg-card/60 shadow-[0_0_25px_rgba(0,255,136,0.1)]"
                  : isPopular
                    ? "border-primary/60 bg-primary/5 shadow-[0_0_25px_rgba(0,212,255,0.15)]"
                    : "border-border/50 bg-card/40 hover:border-primary/30"
              }`}
            >
              {isPopular && !isCurrent && (
                <div className="absolute top-0 inset-x-0 bg-primary text-primary-foreground text-[10px] font-black py-1 text-center font-mono tracking-widest">
                   Recommended
                </div>
              )}
              {isCurrent && (
                <div className="absolute top-0 inset-x-0 bg-accent text-black text-[10px] font-black py-1 text-center font-mono tracking-widest">
                   Current plan
                </div>
              )}

              <CardHeader className={`text-center pb-3 ${isPopular || isCurrent ? "pt-8" : ""}`}>
                 <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                <div className="mt-3 flex justify-center items-baseline gap-1">
                  {isFree ? (
                     <span className="text-3xl font-semibold text-accent">Free</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-white/60">
                        {plan.priceKes}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">KES/mo</span>
                    </>
                  )}
                </div>
                <CardDescription className="font-mono text-[10px] mt-1 text-primary/70">
                  {plan.maxBots} bots · {plan.maxWebApps} web apps
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pt-2">
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                        isCurrent ? "text-accent" : isPopular ? "text-primary" : "text-secondary"
                      }`} />
                      <span className="text-muted-foreground font-mono">{feature}</span>
                    </li>
                  ))}
                  {[].map((feat, i) => (
                    <li key={`ex-${i}`} className="flex items-start gap-2 text-xs opacity-40">
                      <X className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <span className="text-muted-foreground font-mono line-through">{feat}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-3 border-t border-border/50 bg-background/20">
                {isFree ? (
                     <Button data-testid={`button-plan-${plan.id}`} className="w-full text-xs" variant="outline" disabled>
                     {isCurrent ? "Current plan" : "Included"}
                  </Button>
                ) : (
                  <Button
                     data-testid={`button-plan-${plan.id}`}
                     className={`w-full font-medium text-xs ${
                      isCurrent
                        ? "bg-accent/20 text-accent hover:bg-accent/30 cursor-default"
                        : isPopular
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,212,255,0.3)]"
                          : "bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/30"
                    }`}
                    disabled={isCurrent}
                    onClick={() => !isCurrent && setPayMode({
                      type: "subscription",
                      planId: plan.id,
                      name: plan.name,
                      kes: plan.priceKes,
                    })}
                  >
                    {isCurrent ? (
                         <><ShieldCheck className="mr-1.5 h-3 w-3" /> Active</>
                    ) : (
                         <><CreditCard className="mr-1.5 h-3 w-3" /> Subscribe — KES {plan.priceKes}</>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </motion.div>

      <motion.div variants={item}>
        <div className="bg-background/20 rounded-xl border border-border/30 p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            <strong className="text-foreground">How subscriptions work:</strong> Click Subscribe, enter your M-Pesa number, enter your PIN on the prompt. 
            Your plan upgrades instantly. All payments via Safaricom M-Pesa — no card required.
          </div>
        </div>
      </motion.div>

      <PaymentModal
        open={!!payMode}
        onClose={() => { setPayMode(null); qc.invalidateQueries({ queryKey: ["getMe"] }); }}
        mode={payMode}
      />
    </motion.div>
  );
}
