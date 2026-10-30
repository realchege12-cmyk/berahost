import { motion } from "framer-motion";
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle,
  Info,
  Server,
  CreditCard,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { data: notifications, isLoading, refetch } = useListNotifications();
  const markReadMutation = useMarkNotificationRead({
    mutation: {
      onSuccess: () => refetch()
    }
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const getIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('deployed') || t.includes('server')) return <Server className="h-5 w-5 text-primary" />;
    if (t.includes('fail') || t.includes('crash') || t.includes('error')) return <AlertCircle className="h-5 w-5 text-destructive" />;
    if (t.includes('payment') || t.includes('bonus')) return <CreditCard className="h-5 w-5 text-secondary" />;
    if (t.includes('success') || t.includes('complete')) return <CheckCircle2 className="h-5 w-5 text-accent" />;
    if (t.includes('admin') || t.includes('system')) return <ShieldCheck className="h-5 w-5 text-primary" />;
    return <Info className="h-5 w-5 text-muted-foreground" />;
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const markAllRead = () => {
    // In a real app, there would be a markAllRead endpoint.
    // For now, we'll mark them one by one if there are few, or just ignore.
    const unread = notifications?.filter(n => !n.isRead) || [];
    unread.forEach(n => markReadMutation.mutate({ id: n.id }));
  };

  return (
    <motion.div 
      className="space-y-6 max-w-4xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <motion.div variants={item}>
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary flex items-center gap-3">
            <Bell className="h-8 w-8 text-primary" /> NOTIFICATIONS
          </h1>
          <p className="text-muted-foreground font-mono mt-1">
            System alerts, deployment status, and account updates.
          </p>
        </motion.div>
        
        <motion.div variants={item}>
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              className="font-mono border-primary/30 text-primary hover:bg-primary/10"
              onClick={markAllRead}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> MARK ALL READ
            </Button>
          )}
        </motion.div>
      </div>

      <motion.div variants={item}>
        <Card className="border-border/50 bg-card/30 backdrop-blur-sm shadow-none">
          <CardContent className="p-0">
            {notifications && notifications.length > 0 ? (
              <div className="divide-y divide-border/50">
                {notifications.map((notification) => (
                  <div 
                    key={notification.id} 
                    className={`p-4 flex gap-4 transition-colors ${
                      !notification.isRead ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className={`mt-1 shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                      !notification.isRead ? 'bg-background border border-primary/30' : 'bg-background/50'
                    }`}>
                      {getIcon(notification.title)}
                    </div>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <h4 className={`font-bold text-sm ${!notification.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </h4>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className={`text-sm ${!notification.isRead ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                        {notification.message}
                      </p>
                    </div>
                    
                    {!notification.isRead && (
                      <div className="shrink-0 flex items-center">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:bg-primary/20"
                          onClick={() => markReadMutation.mutate({ id: notification.id })}
                          title="Mark as read"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-bold mb-2">Inbox Empty</h3>
                <p className="text-muted-foreground font-mono">You're all caught up. No new notifications.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
