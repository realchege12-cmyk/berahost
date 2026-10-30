import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Github, Chrome, Loader2, MessageSquare, ArrowLeft, CheckCircle2, RotateCcw, Eye, EyeOff, ShieldCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotStep1Schema = z.object({
  email: z.string().email("Invalid email address"),
});

const forgotStep2Schema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "Digits only"),
  newPassword: z.string().min(6, "At least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type ForgotStep1Form = z.infer<typeof forgotStep1Schema>;
type ForgotStep2Form = z.infer<typeof forgotStep2Schema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { refetch } = useGetMe({ query: { enabled: false, queryKey: getGetMeQueryKey() } });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github") === "unconfigured") toast({ title: "GitHub sign-in unavailable", description: "The administrator has not finished configuring the GitHub OAuth App.", variant: "destructive" });
    if (params.get("github") === "error") toast({ title: "GitHub sign-in failed", description: params.get("message") || "Please try again.", variant: "destructive" });
    if (params.get("google") === "unconfigured") toast({ title: "Google sign-in unavailable", description: "Google sign-in is not configured yet.", variant: "destructive" });
    if (params.get("google") === "error") toast({ title: "Google sign-in failed", description: params.get("message") || "Please try again.", variant: "destructive" });
  }, [toast]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const forgotStep1Form = useForm<ForgotStep1Form>({
    resolver: zodResolver(forgotStep1Schema),
    defaultValues: { email: "" },
  });

  const forgotStep2Form = useForm<ForgotStep2Form>({
    resolver: zodResolver(forgotStep2Schema),
    defaultValues: { otp: "", newPassword: "" },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async () => {
        await refetch();
         toast({ title: "Signed in", description: "Welcome back to your BERAHOST workspace." });
        setLocation("/dashboard");
      },
      onError: (error) => {
         toast({ title: "Sign-in failed", description: (error as any).error || "Check your email and password and try again.", variant: "destructive" });
      },
    },
  });

  function onLoginSubmit(values: LoginForm) {
    loginMutation.mutate({ data: values });
  }

  async function onForgotStep1Submit(values: ForgotStep1Form) {
    setSendingOtp(true);
    try {
      const res = await fetch(`${BASE}api/auth/otp/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error || "Could not send OTP", variant: "destructive" });
        return;
      }
      setForgotEmail(values.email);
      setForgotStep(2);
       toast({ title: "Verification code sent", description: "Check your registered WhatsApp number." });
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  }

  async function onForgotStep2Submit(values: ForgotStep2Form) {
    setResettingPw(true);
    try {
      const res = await fetch(`${BASE}api/auth/otp/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, otp: values.otp, newPassword: values.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Reset Failed", description: data.error || "Could not reset password", variant: "destructive" });
        return;
      }
       toast({ title: "Password reset", description: "You can now sign in with your new password." });
      setMode("login");
      setForgotStep(1);
      forgotStep1Form.reset();
      forgotStep2Form.reset();
      loginForm.setValue("email", forgotEmail);
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setResettingPw(false);
    }
  }

  return (
       <div className="auth-page min-h-[100dvh] bg-background flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      <ThemeToggle className="!fixed right-4 top-4 z-50 sm:right-6 sm:top-6" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg z-10"
      >
        <Card className="border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-1 text-center">
           <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
              BERAHOST
            </CardTitle>
             <CardDescription className="mt-2 text-sm font-medium text-slate-700">
               {mode === "login" ? "Sign in to manage your bot workspace." : "Reset your password securely."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <AnimatePresence mode="wait">
              {mode === "login" ? (
                <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                  <Form {...loginForm}>
                     <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4" data-testid="form-login">
                      <FormField control={loginForm.control} name="email" render={({ field }) => (
                        <FormItem>
                           <FormLabel className="text-sm font-medium text-slate-700">Email address</FormLabel>
                          <FormControl>
                             <Input data-testid="input-login-email" autoComplete="email" type="email" placeholder="you@company.com" {...field} className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={loginForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                             <FormLabel className="text-sm font-medium text-slate-700">Password</FormLabel>
                            <button
                              type="button"
                              onClick={() => { setMode("forgot"); setForgotStep(1); forgotStep1Form.setValue("email", loginForm.getValues("email")); }}
                               data-testid="button-forgot-password"
                               className="text-xs text-emerald-700 hover:text-emerald-800 underline underline-offset-2 transition-colors"
                            >
                              Forgot Password?
                            </button>
                          </div>
                          <FormControl>
                             <div className="relative"><Input data-testid="input-login-password" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" {...field} className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all" /><button type="button" data-testid="button-toggle-login-password" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button
                        type="submit"
                         data-testid="button-submit-login"
                         className="w-full h-12 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all mt-4"
                        disabled={loginMutation.isPending}
                      >
                         {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                         {loginMutation.isPending ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                  </Form>
                </motion.div>
              ) : forgotStep === 1 ? (
                <motion.div key="forgot1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                  <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                    <p className="text-sm text-slate-600">
                      Enter your email — we'll send an OTP to your <span className="text-primary">registered WhatsApp number</span>.
                    </p>
                  </div>
                  <Form {...forgotStep1Form}>
                    <form onSubmit={forgotStep1Form.handleSubmit(onForgotStep1Submit)} className="space-y-4">
                      <FormField control={forgotStep1Form.control} name="email" render={({ field }) => (
                        <FormItem>
                           <FormLabel className="text-sm font-medium text-slate-700">Email address</FormLabel>
                          <FormControl>
                             <Input data-testid="input-forgot-email" autoComplete="email" type="email" placeholder="you@company.com" {...field} className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button
                        type="submit"
                        className="w-full font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all"
                        disabled={sendingOtp}
                      >
                        {sendingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                         Send verification code
                      </Button>
                      <Button type="button" variant="ghost" className="w-full text-sm text-slate-600" onClick={() => setMode("login")}>
                        <ArrowLeft className="mr-1.5 h-3 w-3" /> Back to Login
                      </Button>
                    </form>
                  </Form>
                </motion.div>
              ) : (
                <motion.div key="forgot2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                  <div className="mb-4 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400">OTP SENT</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Check the WhatsApp registered with <span className="text-emerald-400">{forgotEmail}</span>.
                    </p>
                  </div>
                  <Form {...forgotStep2Form}>
                    <form onSubmit={forgotStep2Form.handleSubmit(onForgotStep2Submit)} className="space-y-4">
                      <FormField control={forgotStep2Form.control} name="otp" render={({ field }) => (
                        <FormItem>
                         <FormLabel className="text-sm font-medium text-slate-700">6-digit verification code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="000000"
                              maxLength={6}
                              inputMode="numeric"
                              {...field}
                               data-testid="input-reset-otp" autoComplete="one-time-code" className="h-12 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 text-center text-2xl tracking-[0.45em] focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={forgotStep2Form.control} name="newPassword" render={({ field }) => (
                        <FormItem>
                         <FormLabel className="text-sm font-medium text-slate-700">New password</FormLabel>
                          <FormControl>
                             <Input data-testid="input-reset-password" autoComplete="new-password" type="password" placeholder="Choose a new password" {...field} className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button
                        type="submit"
                        className="w-full font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_10px_rgba(0,212,255,0.3)] transition-all"
                        disabled={resettingPw}
                      >
                        {resettingPw ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                         Reset password
                      </Button>
                      <Button type="button" variant="ghost" className="w-full text-sm text-slate-600" onClick={() => { setForgotStep(1); forgotStep2Form.reset(); }}>
                        <RotateCcw className="mr-1.5 h-3 w-3" /> Resend OTP
                      </Button>
                    </form>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 text-center text-sm border-t border-slate-200 pt-6">
            {mode === "login" && <>
              <div className="flex w-full items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"><span className="h-px flex-1 bg-border/70" />or<span className="h-px flex-1 bg-border/70" /></div>
              <Button type="button" variant="outline" className="w-full border-slate-300 bg-white hover:bg-slate-50" onClick={() => { window.location.href = `${BASE}api/auth/github?returnTo=/dashboard`; }}><Github className="mr-2 h-4 w-4" /> Continue with GitHub</Button>
              <Button type="button" variant="outline" className="w-full border-slate-300 bg-white hover:bg-slate-50" onClick={() => { window.location.href = `${BASE}api/auth/google?returnTo=/dashboard`; }}><Chrome className="mr-2 h-4 w-4" /> Continue with Google</Button>
              <p className="text-[11px] text-muted-foreground">GitHub sign-in also lets you deploy repositories you authorize, including private repositories.</p>
            </>}
            <div className="text-muted-foreground text-xs">
               Need an account?{" "}
              <Link href="/register" className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-600/30">
                 Create an account
              </Link>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
