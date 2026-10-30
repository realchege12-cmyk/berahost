import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { motion } from "framer-motion";
import {
  LifeBuoy,
  ArrowLeft,
  Send,
  User,
  ShieldCheck,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { apiFetch } from "@/lib/api";

interface TicketMsg {
  id: number;
  ticketId: number;
  userId: number;
  message: string;
  isAdmin: boolean;
  createdAt: string;
}

interface TicketDetail {
  id: number;
  subject: string;
  status: string;
  priority: string;
  userId: number;
  adminReply: string | null;
  createdAt: string;
}

export default function AdminTicketDetail() {
  const [, params] = useRoute("/admin/support/:id");
  const ticketId = params?.id ? parseInt(params.id) : 0;
  const { data: me } = useGetMe();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<TicketMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const data = await apiFetch(`/api/support/tickets/${ticketId}/messages`);
      setTicket(data.ticket);
      setMessages(data.messages || []);
    } catch {
      toast({ title: "Error", description: "Failed to load ticket", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) fetchData();
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendAdminReply = async () => {
    const msg = replyText.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/admin/support/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      setReplyText("");
      await fetchData();
      toast({ title: "Reply sent" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.error || "Failed to send reply", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    setClosing(true);
    try {
      await apiFetch(`/api/admin/support/tickets/${ticketId}/close`, {
        method: "POST",
      });
      await fetchData();
      toast({ title: "Ticket Closed" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.error || "Failed to close ticket", variant: "destructive" });
    } finally {
      setClosing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open": return "bg-accent/10 text-accent border-accent/20";
      case "in_progress": return "bg-primary/10 text-primary border-primary/20";
      case "closed": return "bg-muted text-muted-foreground border-border";
      default: return "bg-secondary/10 text-secondary border-secondary/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "text-destructive";
      case "medium": return "text-secondary";
      default: return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-3/4" />
          <Skeleton className="h-32 w-3/4 ml-auto" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <XCircle className="mx-auto h-12 w-12 text-destructive/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">Ticket Not Found</h2>
        <Link href="/admin/support">
          <Button variant="outline" className="font-mono">← BACK TO SUPPORT DESK</Button>
        </Link>
      </div>
    );
  }

  const isClosed = ticket.status === "closed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl mx-auto pb-36"
    >
      <div className="flex items-center gap-3">
        <Link href="/admin/support">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
          SUPPORT DESK · TICKET #{ticket.id}
        </h1>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-6 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div>
            <h2 className="text-xl font-bold mb-2">{ticket.subject}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
              <span>User ID: #{ticket.userId}</span>
              <Badge variant="outline" className={`text-[10px] uppercase ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace("_", " ")}
              </Badge>
              <span className={`font-semibold ${getPriorityColor(ticket.priority)}`}>
                <AlertCircle className="inline h-3 w-3 mr-1" />
                {ticket.priority?.toUpperCase()} PRIORITY
              </span>
              <span>
                <Clock className="inline h-3 w-3 mr-1" />
                {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {!isClosed && (
            <Button
              variant="outline"
              size="sm"
              className="font-mono border-border/50 hover:border-green-500/50 hover:text-green-400 shrink-0"
              onClick={closeTicket}
              disabled={closing}
            >
              {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              CLOSE TICKET
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono">No messages yet.</div>
        ) : (
          messages.map((msg) => {
            const isAdminMsg = msg.isAdmin;
            const isUserMsg = !isAdminMsg;

            return (
              <div key={msg.id} className={`flex ${isAdminMsg ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[85%] ${isAdminMsg ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    isAdminMsg
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {isAdminMsg ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>

                  <div className={`flex flex-col ${isAdminMsg ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs font-bold">
                        {isAdminMsg ? "You (Admin)" : `User #${msg.userId}`}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className={`p-4 rounded-2xl whitespace-pre-wrap text-sm ${
                      isAdminMsg
                        ? "bg-primary/10 border border-primary/20 text-foreground rounded-tr-sm"
                        : "bg-card border border-border/50 text-foreground rounded-tl-sm"
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!isClosed && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-10">
          <div className="max-w-4xl mx-auto w-full">
            <div className="mb-2">
              <span className="text-[10px] font-mono text-primary uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Admin Reply
              </span>
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your admin reply... (Enter to send, Shift+Enter for newline)"
                className="min-h-[60px] resize-none bg-background/50 font-mono border-primary/30 focus-visible:ring-primary/50 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendAdminReply();
                  }
                }}
              />
              <Button
                size="icon"
                className="h-[60px] w-[60px] shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,200,255,0.3)]"
                onClick={sendAdminReply}
                disabled={sending || !replyText.trim()}
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
