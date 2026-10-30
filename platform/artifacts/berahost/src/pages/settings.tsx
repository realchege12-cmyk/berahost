import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Settings,
  Shield,
  User,
  Save,
  Lock,
  LogOut,
  Camera,
  Eye,
  EyeOff,
  Upload,
  X,
} from "lucide-react";
import {
  useGetMe,
  useLogout,
  useUpdateProfile,
  useChangePassword,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL;

const profileSchema = z.object({
  displayName: z.string().max(100, "Max 100 characters").optional(),
  phone: z.string().max(20, "Max 20 characters").optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(6, "At least 6 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function SettingsPage() {
  const { data: user, isLoading } = useGetMe();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => setLocation("/login"),
    },
  });

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      displayName: user?.displayName ?? "",
      phone: user?.phone ?? "",
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetMeQueryKey(), data.user);
        toast({ title: "Profile updated", description: "Your changes have been saved." });
      },
      onError: (err: any) => {
        toast({ title: "Update failed", description: err?.message ?? "Please try again.", variant: "destructive" });
      },
    },
  });

  const changePassword = useChangePassword({
    mutation: {
      onSuccess: () => {
        passwordForm.reset();
        toast({ title: "Password changed", description: "Your new password is active." });
      },
      onError: (err: any) => {
        toast({ title: "Password change failed", description: err?.message ?? "Please try again.", variant: "destructive" });
      },
    },
  });

  const onSaveProfile = (values: ProfileForm) => {
    updateProfile.mutate({
      data: {
        displayName: values.displayName || null,
        phone: values.phone || null,
      },
    });
  };

  const onChangePassword = (values: PasswordForm) => {
    changePassword.mutate({
      data: { currentPassword: values.currentPassword, newPassword: values.newPassword },
    });
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5 MB.", variant: "destructive" });
      return;
    }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCancelAvatar = () => {
    setPendingFile(null);
    setAvatarPreview(null);
  };

  const handleUploadAvatar = async () => {
    if (!pendingFile) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("avatar", pendingFile);
      const res = await fetch(`${BASE}api/auth/upload-avatar`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      queryClient.setQueryData(getGetMeQueryKey(), data.user);
      setPendingFile(null);
      setAvatarPreview(null);
      toast({ title: "Photo updated", description: "Your profile picture has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const currentAvatar = avatarPreview ?? user?.avatarUrl ?? undefined;
  const initials = (user?.displayName || user?.email || "??").substring(0, 2).toUpperCase();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-64 mb-2" />
        <div className="grid gap-6 md:grid-cols-2 mt-8">
          <Skeleton className="h-[500px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6 max-w-4xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
         <h1 className="page-title flex items-center gap-3">
           <Settings className="h-7 w-7 text-primary" /> Settings
        </h1>
         <p className="mt-2 text-sm text-muted-foreground">
           Keep your profile current and protect access to your bot workspace.
        </p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Profile identity ── */}
        <motion.div variants={item} className="space-y-6">
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
            <CardHeader>
               <CardTitle className="text-sm flex items-center gap-2">
                 <User className="h-4 w-4 text-primary" /> Profile
              </CardTitle>
              <CardDescription>Your name, photo, and contact details</CardDescription>
            </CardHeader>

            <form onSubmit={profileForm.handleSubmit(onSaveProfile)}>
              <CardContent className="space-y-5">
                {/* ── WhatsApp-style avatar ── */}
                <div className="flex items-center gap-4">
                  <div
                    className="relative group cursor-pointer flex-shrink-0"
                    onClick={handleAvatarClick}
                    title="Change photo"
                  >
                    <Avatar className="h-20 w-20 border-2 border-primary/30 group-hover:border-primary/70 transition-colors">
                      <AvatarImage src={currentAvatar} />
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1 border-2 border-background shadow-sm">
                      <Camera className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate">{user?.displayName || user?.email}</h3>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px] bg-background/50">
                        {user?.isAdmin ? "ADMIN" : "USER"}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase text-primary border-primary/30">
                        {user?.subscriptionPlan} PLAN
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono mt-1.5">
                      Tap photo to change it
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Pending upload action bar */}
                {pendingFile && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-top-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-muted-foreground truncate">{pendingFile.name}</p>
                      <p className="text-[10px] text-primary font-mono">Ready to upload</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={handleCancelAvatar}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-3 font-mono text-xs bg-primary/90 hover:bg-primary flex-shrink-0"
                      onClick={handleUploadAvatar}
                      disabled={uploadingAvatar}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {uploadingAvatar ? "Saving..." : "Save Photo"}
                    </Button>
                  </div>
                )}

                <Separator className="bg-border/50" />

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Display Name</Label>
                  <Input
                    placeholder="Your name"
                    {...profileForm.register("displayName")}
                    className="bg-background/30 font-mono"
                  />
                  {profileForm.formState.errors.displayName && (
                    <p className="text-xs text-destructive">{profileForm.formState.errors.displayName.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Email Address</Label>
                  <Input
                    value={user?.email || ""}
                    readOnly
                    className="bg-background/30 font-mono text-muted-foreground cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Phone Number</Label>
                  <Input
                    placeholder="e.g. 254787527753"
                    {...profileForm.register("phone")}
                    className="bg-background/30 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Account Created</Label>
                  <Input
                    value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ""}
                    readOnly
                    className="bg-background/30 font-mono text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </CardContent>

              <CardFooter className="pt-0">
                 <Button type="submit" data-testid="button-save-profile" className="w-full" disabled={updateProfile.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                   {updateProfile.isPending ? "Saving…" : "Save profile"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </motion.div>

        {/* ── Security + referral ── */}
        <motion.div variants={item} className="space-y-6">
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
            <CardHeader>
               <CardTitle className="text-sm flex items-center gap-2">
                 <Shield className="h-4 w-4 text-secondary" /> Security
              </CardTitle>
              <CardDescription>Change your password</CardDescription>
            </CardHeader>

            <form onSubmit={passwordForm.handleSubmit(onChangePassword)}>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Current Password</Label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? "text" : "password"}
                      placeholder="Current password"
                      {...passwordForm.register("currentPassword")}
                      className="bg-background/30 font-mono pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent((v) => !v)}>
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">New Password</Label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      placeholder="At least 6 characters"
                      {...passwordForm.register("newPassword")}
                      className="bg-background/30 font-mono pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew((v) => !v)}>
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat new password"
                      {...passwordForm.register("confirmPassword")}
                      className="bg-background/30 font-mono pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm((v) => !v)}>
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-0">
                 <Button
                   data-testid="button-change-password"
                  type="submit"
                  variant="outline"
                  className="w-full font-mono border-secondary/40 text-secondary hover:bg-secondary/10"
                  disabled={changePassword.isPending}
                >
                  <Lock className="mr-2 h-4 w-4" />
                   {changePassword.isPending ? "Updating…" : "Change password"}
                </Button>

                 <Button
                   data-testid="button-settings-logout"
                  type="button"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 font-mono"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                   <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </CardFooter>
            </form>
          </Card>

          {user?.referralCode && (
            <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-mono text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-accent" /> REFERRAL PROGRAM
                </CardTitle>
                <CardDescription>Share your code to earn bonuses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Your Referral Code</Label>
                  <Input
                    value={user.referralCode}
                    readOnly
                    className="bg-accent/5 font-mono font-bold text-accent border-accent/30 text-center text-lg h-12"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
