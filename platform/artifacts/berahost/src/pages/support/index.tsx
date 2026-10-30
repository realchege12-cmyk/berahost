import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  LifeBuoy, 
  MessageSquare, 
  Plus, 
  Clock, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useListSupportTickets, useCreateSupportTicket } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ticketSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
  priority: z.string().default("medium"),
});

export default function SupportTickets() {
  const { data: tickets, isLoading, refetch } = useListSupportTickets();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const createMutation = useCreateSupportTicket({
    mutation: {
      onSuccess: () => {
        toast({ title: "Ticket Created", description: "Support team has been notified." });
        setIsDialogOpen(false);
        form.reset();
        refetch();
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as any).error || "Failed to create ticket", variant: "destructive" });
      }
    }
  });

  const form = useForm<z.infer<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: "",
      message: "",
      priority: "medium",
    },
  });

  const onSubmit = (values: z.infer<typeof ticketSchema>) => {
    createMutation.mutate({ data: values });
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open': return 'bg-accent/10 text-accent border-accent/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-secondary/10 text-secondary border-secondary/20';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'text-destructive';
      case 'medium': return 'text-secondary';
      case 'low': return 'text-muted-foreground';
      default: return 'text-primary';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid gap-4 mt-8">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6 max-w-5xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <motion.div variants={item}>
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-3">
            <LifeBuoy className="h-8 w-8 text-secondary" /> SUPPORT CENTER
          </h1>
          <p className="text-muted-foreground font-mono mt-1">
            Need help? Contact our network admins for assistance.
          </p>
        </motion.div>
        
        <motion.div variants={item}>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono bg-secondary hover:bg-secondary/90 text-primary-foreground shadow-[0_0_15px_rgba(180,0,255,0.3)]">
                <Plus className="mr-2 h-4 w-4" /> NEW TICKET
              </Button>
            </DialogTrigger>
            <DialogContent className="border-secondary/30 bg-card/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="font-bold text-xl text-secondary">CREATE SUPPORT TICKET</DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Describe your issue in detail. Admins usually respond within 24 hours.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Subject</FormLabel>
                        <FormControl>
                          <Input placeholder="E.g., Bot deployment failing" {...field} className="bg-background/50 font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Priority Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background/50 font-mono">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">LOW - General Inquiry</SelectItem>
                            <SelectItem value="medium">MEDIUM - Issue/Bug</SelectItem>
                            <SelectItem value="high">HIGH - Critical System Failure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Message Details</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Provide as much context as possible..." 
                            className="min-h-[150px] bg-background/50 font-mono resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" className="w-full font-mono bg-secondary hover:bg-secondary/90 text-primary-foreground" disabled={createMutation.isPending}>
                    SUBMIT TRANSMISSION
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </motion.div>
      </div>

      <motion.div variants={item} className="grid gap-4">
        {tickets && tickets.length > 0 ? (
          tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`}>
              <Card className="border-border/50 bg-card/30 backdrop-blur-sm hover:border-secondary/50 transition-all cursor-pointer group hover:bg-card/50">
                <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-background/50 border border-border/50 flex items-center justify-center shrink-0 group-hover:bg-secondary/10 group-hover:border-secondary/30 transition-colors">
                      <MessageSquare className="h-5 w-5 text-muted-foreground group-hover:text-secondary transition-colors" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg group-hover:text-secondary transition-colors">{ticket.subject}</h3>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span>ID: #{ticket.id}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className={`h-3 w-3 ${getPriorityColor(ticket.priority)}`} />
                          Priority: {ticket.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center sm:justify-end text-sm text-primary font-mono group-hover:underline">
                    View Thread →
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <Card className="border-dashed border-border/50 bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <LifeBuoy className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold mb-2">No Support Tickets</h3>
              <p className="text-muted-foreground font-mono max-w-sm">
                You don't have any open support requests. Everything looking good?
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </motion.div>
  );
}
