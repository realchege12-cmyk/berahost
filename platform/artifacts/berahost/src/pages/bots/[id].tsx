import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Bot, 
  ArrowLeft, 
  Terminal, 
  ShieldAlert, 
  ExternalLink, 
  Play, 
  Lock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  AlertTriangle,
  Smartphone,
  Link2,
  KeyRound,
  Wifi,
  ListChecks,
  Info
} from "lucide-react";
import { useGetBot, useCreateDeployment, getGetBotQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";

export default function BotDetails() {
  const [, params] = useRoute("/bots/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const botId = params?.id ? parseInt(params.id) : 0;
  const { data: bot, isLoading } = useGetBot(botId, {
    query: { enabled: !!botId, queryKey: getGetBotQueryKey(botId) },
  });
  
  const createDeploymentMutation = useCreateDeployment({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Deployment Initialized",
          description: "Bot is starting up. Redirecting to console...",
        });
        setLocation(`/deployments/${data.id}`);
      },
      onError: (error: any) => {
        const message =
          error?.data?.error ??
          error?.message ??
          "Something went wrong. Please try again.";
        toast({
          title: "Deployment Failed",
          description: message,
          variant: "destructive",
        });
      }
    }
  });

  // Dynamic schema generation based on bot requirements
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState("");
  
  const handleInputChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation for required vars
    if (bot?.requiredVars) {
      const missing = Object.keys(bot.requiredVars).filter(k => !formData[k]);
      if (missing.length > 0) {
        toast({
          title: "Missing Required Variables",
          description: `Please fill in: ${missing.join(', ')}`,
          variant: "destructive",
        });
        return;
      }
    }

    createDeploymentMutation.mutate({
      data: {
        botId,
        envVars: formData,
        customName: customName.trim() || undefined,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24 mb-6" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-2">Bot not found</h2>
        <Link href="/bots">
          <Button variant="outline">Return to Marketplace</Button>
        </Link>
      </div>
    );
  }

  // Detect which key is the session key — bots use either SESSION_ID or SESSION.
  // Find the first required var whose key name contains "SESSION".
  const sessionKey = bot.requiredVars
    ? Object.keys(bot.requiredVars as Record<string, string>).find(k => k.toUpperCase().includes("SESSION"))
    : undefined;
  const sessionPrefix = (bot as any).sessionPrefix as string | null | undefined;
  const sessionId = (sessionKey ? formData[sessionKey] : '') || '';
  const isSessionValid = sessionId.length === 0 ||
    (!sessionPrefix || sessionId.startsWith(sessionPrefix));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto"
    >
      <Link href="/bots">
        <Button variant="ghost" size="sm" className="font-mono text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> BACK TO MARKETPLACE
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,212,255,0.2)]">
            <Bot className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{bot.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-mono text-[10px] bg-background/50 border-primary/30 text-primary">
                {bot.platform}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">v{bot.version}.0</span>
            </div>
          </div>
        </div>
        
        {bot.sessionGuideUrl && (
          <a href={bot.sessionGuideUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" className="font-mono border-secondary/50 text-secondary hover:bg-secondary/10">
              <ExternalLink className="mr-2 h-4 w-4" /> GET SESSION ID
            </Button>
          </a>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-mono text-lg flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" /> DESCRIPTION
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {bot.description || "No description provided."}
              </p>
            </CardContent>
          </Card>

          <form onSubmit={onSubmit}>
            <Card className="border-primary/20 bg-card/40 backdrop-blur-sm shadow-[0_0_30px_rgba(0,212,255,0.05)] relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary" />
              <CardHeader>
                <CardTitle className="font-mono text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-secondary" /> CONFIGURATION
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  Set environment variables for your instance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="deployment-name" className="font-mono text-xs uppercase tracking-wider">
                    Deployment Name
                  </Label>
                  <Input
                    id="deployment-name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={`e.g. ${bot.name} Main`}
                    maxLength={100}
                    className="font-mono border-primary/30 focus-visible:border-primary focus-visible:ring-primary/50"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Give this instance a name so you can identify it when managing multiple deployments.
                  </p>
                </div>
                
                {bot.requiredVars && Object.entries(bot.requiredVars).length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase border-b border-border/50 pb-2">Required Variables</h3>
                    
                    {Object.entries(bot.requiredVars as Record<string, string>).map(([key, desc]) => {
                      const isThisSessionKey = key === sessionKey;
                      const isLockable = key === "SESSION_ID";
                      return (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={key} className="font-mono text-xs flex items-center gap-2">
                          {key}
                          {isLockable && <Lock className="h-3 w-3 text-secondary" />}
                        </Label>

                        {isThisSessionKey ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Input
                                id={key}
                                value={formData[key] || ''}
                                onChange={(e) => handleInputChange(key, e.target.value)}
                                placeholder="Paste your Session ID here"
                                className={`font-mono pr-10 ${
                                  sessionId
                                    ? isSessionValid
                                      ? 'border-accent focus-visible:ring-accent/50'
                                      : 'border-destructive focus-visible:ring-destructive/50'
                                    : ''
                                }`}
                                required
                              />
                              {sessionId && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  {isSessionValid ? (
                                    <CheckCircle2 className="h-4 w-4 text-accent" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  )}
                                </div>
                              )}
                            </div>

                            {isLockable && (
                              <Alert variant="default" className="bg-secondary/5 border-secondary/20 py-2">
                                <AlertTitle className="text-xs font-mono text-secondary flex items-center gap-1 mb-1">
                                  <AlertTriangle className="h-3 w-3" /> CRITICAL WARNING
                                </AlertTitle>
                                <AlertDescription className="text-[10px] text-muted-foreground font-mono">
                                  SESSION_ID cannot be changed after deployment. Double-check before proceeding.
                                  {sessionPrefix && (
                                    <span className="block mt-1 text-secondary/80">
                                      ⚠ Must start with <strong className="text-secondary">{sessionPrefix}</strong>
                                    </span>
                                  )}
                                </AlertDescription>
                              </Alert>
                            )}

                            {bot.sessionGuideUrl && (
                              <a href={bot.sessionGuideUrl} target="_blank" rel="noreferrer" className="inline-block mt-2">
                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs font-mono border-accent/50 text-accent hover:bg-accent/10">
                                  Get your Session ID →
                                </Button>
                              </a>
                            )}
                          </div>
                        ) : (
                          <Input
                            id={key}
                            value={formData[key] || ''}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            placeholder={String(desc)}
                            className="font-mono"
                            required
                          />
                        )}
                        {!isThisSessionKey && (
                          <p className="text-[10px] text-muted-foreground font-mono">{String(desc)}</p>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}

                {bot.optionalVars && Object.entries(bot.optionalVars).length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase border-b border-border/50 pb-2">Optional Variables</h3>
                    
                    {Object.entries(bot.optionalVars as Record<string, string>).map(([key, desc]) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={key} className="font-mono text-xs">{key}</Label>
                        <Input 
                          id={key}
                          value={formData[key] || ''}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          placeholder={String(desc)}
                          className="font-mono bg-background/30"
                        />
                        <p className="text-[10px] text-muted-foreground font-mono">{String(desc)}</p>
                      </div>
                    ))}
                  </div>
                )}

              </CardContent>
              <CardFooter className="bg-background/50 border-t border-border/50 p-6">
                <Button 
                  type="submit" 
                  className="w-full font-mono font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,212,255,0.4)] hover:shadow-[0_0_25px_rgba(0,212,255,0.6)] transition-all h-12 text-base"
                  disabled={createDeploymentMutation.isPending || !isSessionValid}
                >
                  {createDeploymentMutation.isPending ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-5 w-5 fill-current" />
                  )}
                  INITIATE DEPLOYMENT
                </Button>
              </CardFooter>
            </Card>
          </form>
        </div>

        <div className="space-y-6">
          {/* Technical Specs — repo URL intentionally hidden from users */}
          <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-mono text-sm text-muted-foreground flex items-center gap-2">
                <Info className="h-3.5 w-3.5" /> QUICK STATS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-border/30">
                <span className="text-xs font-mono text-muted-foreground">Platform</span>
                <span className="text-sm font-medium capitalize">{bot.platform}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border/30">
                <span className="text-xs font-mono text-muted-foreground">Managed by</span>
                <span className="text-xs font-mono text-accent font-bold">BERAHOST</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border/30">
                <span className="text-xs font-mono text-muted-foreground">Version</span>
                <span className="text-sm font-medium">v{bot.version}.0</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border/30">
                <span className="text-xs font-mono text-muted-foreground">Access</span>
                <span className="text-sm font-bold text-accent">
                  Monthly subscription
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Connection Setup Guide */}
          {!sessionKey && (
            <Card className="border-primary/30 bg-card/40 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-primary/60 via-secondary/60 to-primary/60" />
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm flex items-center gap-2 text-primary">
                  <Link2 className="h-4 w-4" /> HOW TO CONNECT
                </CardTitle>
                <CardDescription className="font-mono text-[10px]">
                  Pairing code — no QR scan needed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Play, step: "1", text: "Enter your WhatsApp number below and click INITIATE DEPLOYMENT" },
                  { icon: Wifi, step: "2", text: "Bot starts up and requests a pairing code from WhatsApp" },
                  { icon: KeyRound, step: "3", text: "A pairing code (e.g. AB12-CD34) appears in your deployment console" },
                  { icon: Smartphone, step: "4", text: "Open WhatsApp → Settings → Linked Devices → Link a Device" },
                  { icon: Link2, step: "5", text: "Tap \"Link with phone number instead\" and enter the code" },
                  { icon: CheckCircle2, step: "6", text: "Bot connects, sends you a confirmation message, and is live!" },
                ].map(({ icon: Icon, step, text }) => (
                  <div key={step} className="flex gap-3 items-start">
                    <div className="shrink-0 h-5 w-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                      <span className="text-[10px] font-bold font-mono text-primary">{step}</span>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                ))}

                <div className="mt-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 flex gap-2 items-start">
                  <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-yellow-300">
                    Pairing codes expire in ~60 seconds. Enter it in WhatsApp quickly after it appears.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Session-based bots: keep existing session guide link */}
          {sessionKey && bot.sessionGuideUrl && (
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm flex items-center gap-2 text-primary">
                  <ListChecks className="h-4 w-4" /> GET SESSION ID
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a href={(bot as any).sessionGuideUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full font-mono text-xs border-accent/50 text-accent hover:bg-accent/10">
                    <ExternalLink className="mr-2 h-3 w-3" /> Open Session Generator
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}
