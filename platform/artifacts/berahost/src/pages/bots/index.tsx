import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Bot, Terminal, Shield, Zap, Play, Search, SlidersHorizontal } from "lucide-react";
import { useListBots } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function BotsMarketplace() {
  const { data: bots, isLoading } = useListBots();
  const [search, setSearch] = useState("");
  const filteredBots = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bots ?? [];
    return (bots ?? []).filter((bot) => `${bot.name} ${bot.description ?? ""} ${bot.platform}`.toLowerCase().includes(query));
  }, [bots, search]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
         <h1 className="page-title">
           Bot marketplace
        </h1>
         <p className="mt-2 text-sm text-muted-foreground">
           Start from a maintained template and configure an instance for your team.
        </p>
      </motion.div>

       <motion.div variants={item} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/50 p-3 sm:flex-row sm:items-center">
         <div className="flex items-center gap-2 text-sm text-muted-foreground"><SlidersHorizontal className="h-4 w-4 text-primary" /> Browse templates</div>
         <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-marketplace-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, platform, or use case" className="h-10 w-full rounded-lg border border-border bg-background/60 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
         <span className="text-xs text-muted-foreground">{filteredBots.length} template{filteredBots.length === 1 ? "" : "s"}</span>
       </motion.div>

       <motion.div variants={item} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
         {filteredBots.map((bot) => (
          <motion.div key={bot.id} variants={item} className="group">
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm h-full flex flex-col hover:border-primary/50 transition-all hover:shadow-[0_0_20px_rgba(0,212,255,0.1)] relative overflow-hidden">
              {bot.isFeatured && (
                <div className="absolute top-0 right-0">
                   <div className="bg-gradient-to-r from-primary to-secondary text-primary-foreground text-[10px] font-semibold px-8 py-1 rotate-45 translate-x-6 translate-y-3 shadow-sm">
                     Featured
                  </div>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                   <CardTitle className="text-xl font-semibold">{bot.name}</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] mt-1 bg-background/50">{bot.platform}</Badge>
                  </div>
                </div>
                <CardDescription className="text-sm line-clamp-2 mt-2">
                  {bot.description || "A powerful WhatsApp bot ready for deployment."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                     <Terminal className="h-3 w-3" /> Version {bot.version}.0
                  </div>
                  {bot.requiredVars && Object.keys(bot.requiredVars).length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <Shield className="h-3 w-3 text-secondary" /> {Object.keys(bot.requiredVars).length} Environment Vars
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                     <Zap className="h-3 w-3 text-accent" /> Ready to configure
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border/50">
                <Link href={`/bots/${bot.id}`} className="w-full">
                     <Button data-testid={`button-configure-bot-${bot.id}`} className="w-full bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/30 group-hover:border-primary transition-all">
                       <Play className="mr-2 h-4 w-4" /> Configure deployment
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        ))}

         {filteredBots.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-border/50 rounded-lg bg-card/20">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
             <h3 className="text-lg font-semibold mb-2">{search ? "No templates match that search" : "Marketplace is being prepared"}</h3>
             <p className="text-muted-foreground">{search ? "Try a different name, platform, or use case." : "Maintained templates will appear here when they are available for deployment."}</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
