import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  ShieldAlert, 
  ArrowLeft,
  Search,
  Clock,
  Terminal
} from "lucide-react";
import { 
  useAdminListAuditLogs,
  useGetMe
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function AdminAuditLogs() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { data: logs, isLoading } = useAdminListAuditLogs();
  const [searchTerm, setSearchTerm] = useState("");

  if (user && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  const filteredLogs = logs?.filter(l => 
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (l.ipAddress && l.ipAddress.includes(searchTerm))
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
            <ShieldAlert className="h-6 w-6 text-primary" /> SYSTEM AUDIT LOGS
          </h1>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2 w-full max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by action or IP..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 bg-background/50 font-mono text-xs border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-background/50">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="font-mono text-xs font-bold uppercase pl-6 w-48">Timestamp</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase w-32">Admin ID</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase w-48">Action</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase">Details (JSON)</TableHead>
                    <TableHead className="font-mono text-xs font-bold uppercase w-32 text-right pr-6">IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length > 0 ? filteredLogs.map((log) => (
                    <TableRow key={log.id} className="border-border/50 hover:bg-white/5 transition-colors">
                      <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        #{log.adminId}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-primary">
                        {log.action}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        <div className="bg-black/30 p-2 rounded flex items-start gap-2 border border-white/5">
                          <Terminal className="h-3 w-3 shrink-0 mt-0.5 opacity-50" />
                          <code className="break-all">{JSON.stringify(log.details)}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6 font-mono text-xs text-muted-foreground">
                        {log.ipAddress || 'Unknown'}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-mono">
                        No audit records found.
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
