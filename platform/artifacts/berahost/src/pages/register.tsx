import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
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
import { Loader2, UserPlus, Shield, Eye, EyeOff } from "lucide-react";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  referralCode: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch } = useGetMe({ query: { enabled: false, queryKey: getGetMeQueryKey() } });
  const [showPassword, setShowPassword] = useState(false);

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", phone: "", referralCode: "" },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async () => {
        await refetch();
        toast({ title: "Account created", description: "Welcome to your BERAHOST workspace." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Registration failed",
          description: (error as any).error || "Could not create account",
          variant: "destructive",
        });
      },
    },
  });

  function onSubmit(values: RegisterForm) {
    registerMutation.mutate({
      data: {
        email: values.email,
        password: values.password,
        phone: values.phone?.trim() || undefined,
        referralCode: values.referralCode?.trim() || undefined,
      },
    });
  }

  return (
     <div className="auth-page min-h-[100dvh] bg-background flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      <ThemeToggle className="!fixed right-4 top-4 z-50 sm:right-6 sm:top-6" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg z-10"
      >
        <Card className="border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-1 text-center">
             <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
              BERAHOST
            </CardTitle>
             <CardDescription className="mt-2 text-sm font-medium text-slate-700">
               Set up a workspace for your WhatsApp bot operations.
            </CardDescription>
            <div className="flex items-center justify-center gap-2 pt-2">
                 <div className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
                <Shield className="h-3 w-3" />
                 No WhatsApp verification required
              </div>
            </div>
          </CardHeader>

          <CardContent>
             <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
               <p className="text-xs leading-5 text-muted-foreground">
                 Start with email and password. You can add a WhatsApp number later from Settings when a bot needs it.
              </p>
            </div>

            <Form {...registerForm}>
               <form onSubmit={registerForm.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-register">
                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-sm font-medium text-slate-700">
                         Email address
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                           data-testid="input-register-email" autoComplete="email" placeholder="you@company.com"
                          {...field}
                          className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-sm font-medium text-slate-700">
                         Password
                      </FormLabel>
                      <FormControl>
                         <div className="relative"><Input data-testid="input-register-password" autoComplete="new-password" type={showPassword ? "text" : "password"} placeholder="At least 6 characters" {...field} className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all" /><button type="button" data-testid="button-toggle-register-password" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-sm font-medium text-slate-700">
                         WhatsApp number <span className="text-muted-foreground/60">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                           data-testid="input-register-phone" autoComplete="tel" placeholder="254 712 345 678"
                          {...field}
                          className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all"
                        />
                      </FormControl>
                      <p className="text-[10px] text-muted-foreground">
                        You can add a number later from Settings.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="referralCode"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-sm font-medium text-slate-700">
                         Referral code <span className="text-muted-foreground/60">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                           data-testid="input-register-referral" placeholder="Enter a code if you have one"
                          {...field}
                          className="h-11 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/25 transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                   data-testid="button-submit-register" className="w-full h-12 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all mt-2"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                   {registerMutation.isPending ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 text-center text-sm border-t border-slate-200 pt-6">
            <div className="text-muted-foreground text-xs">
              Already registered?{" "}
              <Link href="/login" className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-600/30">
                 Sign in
              </Link>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
