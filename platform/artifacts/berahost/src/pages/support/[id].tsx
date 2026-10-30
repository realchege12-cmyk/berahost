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
  XCircle,
  CheckCircle2,
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

export default function TicketDetail() {
  const [, params] = useRoute("/support/:id");
  const ticketId = params?.id ? parseInt(params.id) : 0;
  const { data: me } = useGetMe();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<TicketMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const data = await apiFetch(`/api/support/tickets/${ticketId}/messages`);
      setTicket(data.ticket);
      setMessages(data.messages || []);
    } catch (e: any) {
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

  const sendReply = async () => {
    const msg = replyText.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      setReplyText("");
      await fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e?.error || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
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
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-4 mt-6">
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
        <p className="text-muted-foreground font-mono mb-4">This ticket doesn't exist or you don't have access.</p>
        <Link href="/support">
          <Button variant="outline" className="font-mono">← BACK TO TICKETS</Button>
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
      <Link href="/support">
        <Button variant="ghost" size="sm" className="font-mono text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> BACK TO TICKETS
        </Button>
      </Link>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-6 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div>
            <h1 className="text-xl font-bold mb-2">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
              <span>Ticket #{ticket.id}</span>
              <Badge variant="outline" className={`text-[10px] uppercase ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace("_", " ")}
              </Badge>
              <span className={`font-semibold ${getPriorityColor(ticket.priority)}`}>
                {ticket.priority?.toUpperCase()} PRIORITY
              </span>
              <span>
                <Clock className="inline h-3 w-3 mr-1" />
                {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {isClosed && (
            <Badge className="bg-muted text-muted-foreground border border-border font-mono text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" /> RESOLVED
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono">
            No messages in this ticket yet.
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.userId === me?.id && !msg.isAdmin;
            const isAdminMsg = msg.isAdmin;

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[85%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    isAdminMsg
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : isMe
                      ? "bg-secondary/20 text-secondary border border-secondary/30"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {isAdminMsg ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>

                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs font-bold">
                        {isAdminMsg ? "System Admin" : isMe ? "You" : "User"}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className={`p-4 rounded-2xl whitespace-pre-wrap text-sm ${
                      isAdminMsg
                        ? "bg-primary/10 border border-primary/20 text-foreground rounded-tl-sm"
                        : isMe
                        ? "bg-secondary/20 border border-secondary/30 text-foreground rounded-tr-sm"
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
          <div className="max-w-4xl mx-auto w-full flex items-end gap-2">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
              className="min-h-[60px] resize-none bg-background/50 font-mono border-secondary/30 focus-visible:ring-secondary/50 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
            />
            <Button
              size="icon"
              className="h-[60px] w-[60px] shrink-0 bg-secondary hover:bg-secondary/90 text-primary-foreground shadow-[0_0_15px_rgba(180,0,255,0.3)]"
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
