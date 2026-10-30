import { FormEvent, ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Github,
  Gift,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Search,
  Server,
  Globe2,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface AppLayoutProps { children: ReactNode; }

const workspaceLinks = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Marketplace", href: "/bots", icon: Bot },
  { name: "Deployments", href: "/deployments", icon: Server },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "GitHub deploy", href: "/github", icon: Github },
  { name: "Web hosting", href: "/web-deployments", icon: Globe2 },
];
const growthLinks = [
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { name: "Referrals", href: "/referrals", icon: Gift },
];
const accountLinks = [
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Subscription", href: "/subscriptions", icon: ShieldCheck },
];
const supportLinks = [
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Support", href: "/support", icon: LifeBuoy },
  { name: "API keys", href: "/api-keys", icon: KeyRound },
  { name: "Settings", href: "/settings", icon: Settings },
];
const adminLinks = [
  { name: "Admin overview", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Deployments", href: "/admin/deployments", icon: Activity },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Support", href: "/admin/support", icon: LifeBuoy },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const [adminExpanded, setAdminExpanded] = useState(() => location.startsWith("/admin"));
  const [search, setSearch] = useState("");
  const logoutMutation = useLogout({ mutation: { onSuccess: () => setLocation("/login") } });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (search.trim()) setLocation(`/deployments?search=${encodeURIComponent(search.trim())}`);
  };

  const isNavActive = (path: string) =>
    path === "/dashboard" ? location === path : path === "/admin" ? location === path : location.startsWith(path);

  const initials = (user?.displayName || user?.email || "BH").slice(0, 2).toUpperCase();

  const NavGroup = ({ label, links, onClick }: { label: string; links: typeof workspaceLinks; onClick?: () => void }) => (
    <div className="mb-5" data-testid={`nav-group-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">{label}</p>
      <div className="space-y-1">
        {links.map(({ name, href, icon: Icon }) => {
          const active = isNavActive(href);
          return (
            <Link key={href} href={href} onClick={onClick} data-testid={`link-nav-${href.replace(/\//g, "-").replace(/^-/, "")}`} className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${active ? "border-primary/25 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-white/[0.035] hover:text-foreground"}`}>
              <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground/80"}`} />
              <span className="flex-1">{name}</span>
              {active && <ChevronRight className="h-3.5 w-3.5 text-primary/70" />}
            </Link>
          );
        })}
      </div>
    </div>
  );

  const Navigation = ({ onClick }: { onClick?: () => void }) => (
    <div className="w-full py-5">
      <NavGroup label="Workspace" links={workspaceLinks} onClick={onClick} />
      <NavGroup label="Growth" links={growthLinks} onClick={onClick} />
      <NavGroup label="Billing" links={accountLinks} onClick={onClick} />
      <NavGroup label="Support & access" links={supportLinks} onClick={onClick} />
      {user?.isAdmin && (
        <div className="mt-2 border-t border-border/60 pt-4">
          <button type="button" data-testid="button-toggle-admin-nav" onClick={() => setAdminExpanded((value) => !value)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-amber-700 transition-colors hover:bg-amber-300/10 dark:text-amber-200/80 dark:hover:bg-amber-300/5">
            <ShieldAlert className="h-4 w-4" />
            <span className="flex-1 text-left">Administration</span>
            {adminExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {adminExpanded && <div className="ml-3 mt-1 space-y-1 border-l border-amber-300/20 pl-3"><NavGroup label="" links={adminLinks} onClick={onClick} /></div>}
        </div>
      )}
    </div>
  );

  const Account = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`${mobile ? "bg-background/40" : ""} border-t border-border/60 p-4`}>
      <div className="flex items-center gap-3 px-1 py-2">
        <Avatar className="h-9 w-9 border border-primary/30"><AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-testid="text-account-email">{user?.displayName || user?.email || "Loading account"}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{user?.subscriptionPlan || "no plan"} plan</p>
        </div>
      </div>
      <Button variant="ghost" data-testid="button-logout" className="mt-2 w-full justify-start text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
        <LogOut className="mr-2 h-4 w-4" /> {logoutMutation.isPending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 lg:flex">
        <div className="border-b border-border/60 px-5 py-5">
          <Link href="/dashboard" data-testid="link-brand-dashboard" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Activity className="h-5 w-5" /></span>
            <span><span className="block text-lg font-semibold tracking-tight">BERAHOST</span><span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Cloud hosting platform</span></span>
          </Link>
        </div>
        <ScrollArea className="flex-1 px-3"><Navigation /></ScrollArea>
        <Account />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
          <Link href="/dashboard" data-testid="link-mobile-brand" className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Activity className="h-4 w-4" /></span><span className="font-semibold tracking-tight">BERAHOST</span></Link>
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" size="icon" data-testid="button-open-mobile-menu" aria-label="Open navigation"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="flex w-[min(19rem,90vw)] flex-col border-r-border bg-sidebar p-0">
              <div className="border-b border-border/60 px-5 py-5"><p className="font-semibold">BERAHOST</p><p className="mt-1 text-xs text-muted-foreground">Bot operations workspace</p></div>
              <ScrollArea className="flex-1 px-3"><Navigation /></ScrollArea>
              <Account mobile />
            </SheetContent>
          </Sheet>
        </header>
        <header className="hidden h-[4.5rem] items-center justify-between gap-6 border-b border-border/70 bg-background/70 px-8 backdrop-blur-xl lg:flex">
          <form onSubmit={submitSearch} className="relative w-full max-w-[22rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your projects..." className="h-10 w-full rounded-lg border border-border/70 bg-card/50 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" aria-label="Search your projects" />
          </form>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/notifications" className="relative rounded-lg border border-transparent p-2.5 text-muted-foreground transition-colors hover:border-border hover:bg-white/[0.035] hover:text-foreground" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
            </Link>
            <div className="h-6 w-px bg-border/70" />
            <Link href="/settings" className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.035]">
              <Avatar className="h-8 w-8 border border-primary/30"><AvatarImage src={user?.avatarUrl || undefined} /><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar>
              <div className="hidden xl:block"><p className="max-w-32 truncate text-xs font-medium">{user?.displayName || user?.email || "Account"}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{user?.isAdmin ? "Administrator" : `${user?.subscriptionPlan || "free"} plan`}</p></div>
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-9 lg:pb-9">{children}</div>
        <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[4.25rem] items-center justify-around border-t border-border/70 bg-sidebar/95 px-3 backdrop-blur-xl lg:hidden">
          <Link href="/dashboard" className={`flex flex-col items-center gap-1 text-[10px] ${location === "/dashboard" ? "text-primary" : "text-muted-foreground"}`}><LayoutDashboard className="h-4 w-4" />Home</Link>
          <Link href="/deployments" className={`flex flex-col items-center gap-1 text-[10px] ${location.startsWith("/deployments") ? "text-primary" : "text-muted-foreground"}`}><Server className="h-4 w-4" />Deployments</Link>
          <Link href="/bots" className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/.3)]" aria-label="New deployment"><Plus className="h-5 w-5" /></Link>
          <Link href="/notifications" className={`flex flex-col items-center gap-1 text-[10px] ${location.startsWith("/notifications") ? "text-primary" : "text-muted-foreground"}`}><Bell className="h-4 w-4" />Alerts</Link>
          <Link href="/settings" className={`flex flex-col items-center gap-1 text-[10px] ${location.startsWith("/settings") ? "text-primary" : "text-muted-foreground"}`}><Settings className="h-4 w-4" />Profile</Link>
        </nav>
      </main>
    </div>
  );
}
