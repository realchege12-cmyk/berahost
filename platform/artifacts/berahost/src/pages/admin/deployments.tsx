import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  Activity, 
  ArrowLeft,
  StopCircle,
  Terminal,
  Search
} from "lucide-react";
import { 
  useAdminListDeployments, 
  useAdminStopDeployment,
  useGetMe
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminDeployments() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { data: deployments, isLoading, refetch } = useAdminListDeployments();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const stopMutation = useAdminStopDeployment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Instance Stopped", description: "Admin override successful." });
        refetch();
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as any).error || "Failed to stop instance", variant: "destructive" });
      }
    }
  });

  if (user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-accent/10 text-accent border-accent/20';
      case 'stopped': return 'bg-muted/50 text-muted-foreground border-border';
      case 'deploying': return 'bg-primary/10 text-primary border-primary/20 animate-pulse';
      case 'crashed': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredDeployments = deployments?.filter(d => 
    d.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.id.toString().includes(searchTerm)
  ) || [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> ALL DEPLOYMENTS
          </h1>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by ID or user email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 bg-background/50 font-mono text-xs border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-background/50">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs font-bold uppercase">ID</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">User</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Bot/Platform</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Status</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Metrics</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeployments.length > 0 ? filteredDeployments.map((d) => (
                    <TableRow key={d.id} className="border-border/50 hover:bg-white/5 transition-colors">
                      <TableCell className="font-mono text-sm font-bold">
                        #{d.id}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{d.user?.email || `User #${d.userId}`}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          Created {format(new Date(d.createdAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{d.bot?.name || `Bot #${d.botId}`}</div>
                        <Badge variant="outline" className="font-mono text-[10px] mt-1 border-primary/30 text-primary bg-primary/5">
                          {d.platform || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(d.status)}`}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono text-muted-foreground">
                          Storage: <span className="text-foreground">{d.storageUsedMb}MB</span>
                        </div>
                        {d.pid && (
                          <div className="text-xs font-mono text-muted-foreground mt-1">
                            PID: <span className="text-foreground">{d.pid}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/deployments/${d.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                              <Terminal className="h-4 w-4" />
                            </Button>
                          </Link>
                          {(d.status === 'running' || d.status === 'deploying') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => stopMutation.mutate({ id: d.id })}
                              disabled={stopMutation.isPending}
                            >
                              <StopCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono">
                        No deployments found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
