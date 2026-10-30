import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Bot,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  MoreHorizontal,
  PlayCircle,
  RefreshCw,
  Server,
  Square,
  Trash2,
} from "lucide-react";
import { useListDeployments, useStopDeployment, useStartDeployment, useDeleteDeployment } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { formatDistanceToNow } from "date-fns";

function statusTone(status: string) {
  if (status === "running") return "border-accent/30 bg-accent/10 text-accent";
  if (status === "deploying") return "border-primary/30 bg-primary/10 text-primary";
  if (status === "crashed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted/30 text-muted-foreground";
}

function statusDot(status: string) {
  if (status === "running") return "bg-accent shadow-[0_0_12px_hsl(var(--accent))]";
  if (status === "deploying") return "bg-primary animate-pulse";
  if (status === "crashed") return "bg-destructive shadow-[0_0_12px_hsl(var(--destructive))]";
  return "bg-muted-foreground/60";
}

export default function Deployments() {
  const { data: deployments, isLoading, isError, refetch } = useListDeployments();
  const { toast } = useToast();

  const stopMutation = useStopDeployment({
    mutation: {
      onSuccess: () => { toast({ title: "Deployment stopping", description: "The runtime shutdown sequence has started." }); refetch(); },
      onError: (err) => toast({ title: "Unable to stop", description: (err as any).error || "Try again.", variant: "destructive" }),
    },
  });
  const startMutation = useStartDeployment({
    mutation: {
      onSuccess: () => { toast({ title: "Deployment starting", description: "The runtime is being brought online." }); refetch(); },
      onError: (err) => toast({ title: "Unable to start", description: (err as any).error || "Try again.", variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteDeployment({
    mutation: {
      onSuccess: () => { toast({ title: "Deployment deleted", description: "The deployment and its stored logs were removed." }); refetch(); },
      onError: (err) => toast({ title: "Unable to delete", description: (err as any).error || "Try again.", variant: "destructive" }),
    },
  });

  const copyConsoleLink = async (id: number) => {
    await navigator.clipboard?.writeText(`${window.location.origin}/deployments/${id}`);
    toast({ title: "Console link copied", description: "Share this link to return to the deployment console." });
  };

  if (isLoading) {
    return <div className="space-y-6"><div><Skeleton className="h-10 w-64" /><Skeleton className="mt-2 h-5 w-96" /></div><div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-36 w-full" />)}</div></div>;
  }

  if (isError) {
    return <div className="space-y-6"><div><p className="eyebrow">Deployments</p><h1 className="page-title mt-2">Your deployments</h1></div><Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><AlertCircle className="mb-4 h-12 w-12 text-destructive/50" /><h3 className="text-xl font-semibold">Could not load deployments</h3><p className="mb-6 mt-2 text-sm text-muted-foreground">The deployment service did not return your projects.</p><Button onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button></CardContent></Card></div>;
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="eyebrow">Runtime workspace</p><h1 className="page-title mt-2">Your deployments</h1><p className="mt-2 text-sm text-muted-foreground">Manage your hosted bots, inspect logs, and control the runtime state.</p></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh deployments"><RefreshCw className="h-4 w-4" /></Button><Link href="/bots"><Button className="bg-primary text-primary-foreground"><Bot className="mr-2 h-4 w-4" /> New deployment</Button></Link></div></div>

      {deployments && deployments.length > 0 ? <div className="space-y-3">{deployments.map((dep) => {
        const running = dep.status === "running";
        const busy = dep.status === "deploying";
        const name = (dep as any).customName || dep.bot?.name || `Deployment #${dep.id}`;
        return <Card key={dep.id} className="soft-card overflow-hidden border-border/70 transition-colors hover:border-primary/35"><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10"><Server className="h-5 w-5 text-primary" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold">{name}</h2><Badge variant="outline" className={`gap-1.5 text-[10px] uppercase ${statusTone(dep.status)}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDot(dep.status)}`} />{dep.status}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{dep.bot?.name || `Bot #${dep.botId}`} · {dep.platform || "runtime"}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" /> main</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {dep.createdAt ? `Deployed ${formatDistanceToNow(new Date(dep.createdAt), { addSuffix: true })}` : "Recently deployed"}</span><span className="font-mono">ID {dep.id}</span></div></div></div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><Link href={`/deployments/${dep.id}`}><Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90"><ArrowUpRight className="mr-1.5 h-3.5 w-3.5" /> Open</Button></Link><Link href={`/deployments/${dep.id}`}><Button size="sm" variant="outline" className="border-border/70"><Activity className="mr-1.5 h-3.5 w-3.5" /> Logs</Button></Link>{running || busy ? <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => stopMutation.mutate({ id: dep.id })} disabled={stopMutation.isPending}><Square className="mr-1.5 h-3.5 w-3.5" /> Stop</Button> : <Button size="sm" variant="outline" className="border-accent/30 text-accent hover:bg-accent/10" onClick={() => startMutation.mutate({ id: dep.id })} disabled={startMutation.isPending}><PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Start</Button>}<Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" onClick={() => copyConsoleLink(dep.id)} aria-label="Copy console link"><Copy className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label="Delete deployment"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent className="border-destructive/30 bg-card/95 backdrop-blur-xl"><AlertDialogHeader><AlertDialogTitle className="text-destructive">Delete deployment?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the deployment and its stored logs.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate({ id: dep.id })}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></div></CardContent></Card>;
      })}</div> : <Card className="border-dashed border-border/70 bg-transparent"><CardContent className="flex flex-col items-center justify-center py-20 text-center"><Server className="mb-4 h-12 w-12 text-muted-foreground/30" /><h3 className="text-xl font-semibold">No deployments yet</h3><p className="mb-6 mt-2 max-w-sm text-sm text-muted-foreground">Choose a bot template, add its configuration, and your runtime will appear here with live logs.</p><Link href="/bots"><Button className="bg-primary text-primary-foreground"><Bot className="mr-2 h-4 w-4" /> Browse marketplace</Button></Link></CardContent></Card>}
    </motion.div>
  );
}
