import { motion } from "framer-motion";
import { Trophy, Zap, Bot, RefreshCw, Shield, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL;
const apiFetch = (path: string) => fetch(`${BASE}api${path}`, { credentials: "include" }).then((r) => r.json());

function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
        <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8 }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{score}</span>
    </div>
  );
}

const medals = ["1st", "2nd", "3rd"];

export default function LeaderboardPage() {
  const { data: board, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => apiFetch("/leaderboard"),
  });

  const { data: myScore } = useQuery({
    queryKey: ["leaderboard-my"],
    queryFn: () => apiFetch("/leaderboard/my-score"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">UPTIME LEADERBOARD</h1>
          <p className="text-muted-foreground text-sm">Top deployers ranked by bot health score</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {myScore && !myScore.error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Your Bots", value: myScore.totalDeployments, icon: Bot, color: "text-cyan-400" },
            { label: "Running Now", value: myScore.runningBots, icon: Activity, color: "text-emerald-400" },
            { label: "Total Restarts", value: myScore.totalRestarts, icon: RefreshCw, color: "text-yellow-400" },
            { label: "Health Score", value: myScore.healthScore, icon: Shield, color: "text-purple-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-white/10 bg-black/40">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-white/10 bg-black/40">
        <CardHeader>
          <CardTitle className="font-mono flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Global Rankings
          </CardTitle>
          <CardDescription>Health score = 100 - (restart count × 2). Higher is better.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !board?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-mono">No running bots yet. Deploy one to get on the board!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(board as any[]).map((entry: any, i: number) => (
                <motion.div
                  key={entry.userId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center justify-between p-3 rounded-lg border ${i === 0 ? "border-yellow-500/30 bg-yellow-500/5" : i === 1 ? "border-gray-500/30 bg-gray-500/5" : i === 2 ? "border-orange-500/30 bg-orange-500/5" : "border-white/5 bg-white/2"}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-center text-lg font-bold">
                      {medals[i] ?? <span className="text-sm text-muted-foreground font-mono">#{i + 1}</span>}
                    </span>
                    <div>
                      <p className="font-mono text-sm font-medium">{entry.displayName}</p>
                      <p className="text-xs text-muted-foreground">{entry.totalBots} bot(s) running</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3" />
                      <span className="font-mono">{entry.restartCount} restarts</span>
                    </div>
                    <HealthBar score={entry.healthScore} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
