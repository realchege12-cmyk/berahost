import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  LifeBuoy, 
  ArrowLeft,
  Search,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { 
  useAdminListSupportTickets,
  useGetMe
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";

export default function AdminSupport() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { data: tickets, isLoading } = useAdminListSupportTickets();
  const [searchTerm, setSearchTerm] = useState("");

  if (user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return 'bg-accent/10 text-accent border-accent/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-secondary/10 text-secondary border-secondary/20';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'text-destructive';
      case 'medium': return 'text-secondary';
      case 'low': return 'text-muted-foreground';
      default: return 'text-primary';
    }
  };

  const filteredTickets = tickets?.filter(t => 
    t.subject.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.id.toString().includes(searchTerm)
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
            <LifeBuoy className="h-6 w-6 text-primary" /> SUPPORT DESK
          </h1>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search tickets by subject or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 bg-background/50 font-mono text-xs border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : filteredTickets.length > 0 ? (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <Link key={ticket.id} href={`/admin/support/${ticket.id}`}>
                  <div className="p-4 rounded-lg bg-background/30 border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-background/80 border border-border flex items-center justify-center shrink-0">
                        <MessageSquare className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-base group-hover:text-primary transition-colors">{ticket.subject}</h3>
                          <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(ticket.status)}`}>
                            {ticket.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
                          <span className="text-foreground">User ID: #{ticket.userId}</span>
                          <span>Ticket: #{ticket.id}</span>
                          <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                          <span className="flex items-center gap-1">
                            <AlertCircle className={`h-3 w-3 ${getPriorityColor(ticket.priority)}`} />
                            {ticket.priority.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center self-end md:self-center">
                      <span className="text-xs font-mono text-primary group-hover:underline">Reply →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border border-dashed border-border/50 rounded-lg">
              <LifeBuoy className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-bold mb-1">No Tickets Found</h3>
              <p className="text-muted-foreground font-mono text-sm">No support tickets match your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
