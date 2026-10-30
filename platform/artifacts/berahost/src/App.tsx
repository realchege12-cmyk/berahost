import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { BeraGuide } from "@/components/BeraGuide";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import BotsMarketplace from "@/pages/bots";
import BotDetails from "@/pages/bots/[id]";
import Deployments from "@/pages/deployments";
import DeploymentConsole from "@/pages/deployments/[id]";
import PaymentsPage from "@/pages/payments";
import SubscriptionsPage from "@/pages/subscriptions";
import WebDeploymentsPage from "@/pages/web-deployments";
import NotificationsPage from "@/pages/notifications";
import SupportTickets from "@/pages/support";
import TicketDetail from "@/pages/support/[id]";
import ApiKeysPage from "@/pages/api-keys";
import SettingsPage from "@/pages/settings";
import TeamsPage from "@/pages/teams";
import LeaderboardPage from "@/pages/leaderboard";
import GithubIntegrationPage from "@/pages/github-integration";
import SubmitBotPage from "@/pages/submit-bot";
import ReferralsPage from "@/pages/referrals";
import AdminMarketplacePage from "@/pages/admin/marketplace";

// Admin
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminBots from "@/pages/admin/bots";
import AdminDeployments from "@/pages/admin/deployments";
import AdminSupport from "@/pages/admin/support";
import AdminTicketDetail from "@/pages/admin/support-ticket";
import AdminAuditLogs from "@/pages/admin/audit-logs";
import AdminSettings from "@/pages/admin/settings";
import AdminPaymentsPage from "@/pages/admin/payments";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      {/* User Routes */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/bots"><ProtectedRoute component={BotsMarketplace} /></Route>
      <Route path="/bots/:id"><ProtectedRoute component={BotDetails} /></Route>
      <Route path="/deployments"><ProtectedRoute component={Deployments} /></Route>
      <Route path="/deployments/:id"><ProtectedRoute component={DeploymentConsole} /></Route>
      <Route path="/web-deployments"><ProtectedRoute component={WebDeploymentsPage} /></Route>
      <Route path="/payments"><ProtectedRoute component={PaymentsPage} /></Route>
      <Route path="/subscriptions"><ProtectedRoute component={SubscriptionsPage} /></Route>
      <Route path="/notifications"><ProtectedRoute component={NotificationsPage} /></Route>
      <Route path="/support"><ProtectedRoute component={SupportTickets} /></Route>
      <Route path="/support/:id"><ProtectedRoute component={TicketDetail} /></Route>
      <Route path="/api-keys"><ProtectedRoute component={ApiKeysPage} /></Route>
      <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
      <Route path="/teams"><ProtectedRoute component={TeamsPage} /></Route>
      <Route path="/leaderboard"><ProtectedRoute component={LeaderboardPage} /></Route>
      <Route path="/github"><ProtectedRoute component={GithubIntegrationPage} /></Route>
      <Route path="/submit-bot"><ProtectedRoute component={SubmitBotPage} /></Route>
      <Route path="/referrals"><ProtectedRoute component={ReferralsPage} /></Route>
      <Route path="/admin/marketplace"><ProtectedRoute component={AdminMarketplacePage} /></Route>

      {/* Admin Routes */}
      <Route path="/admin"><ProtectedRoute component={AdminDashboard} /></Route>
      <Route path="/admin/users"><ProtectedRoute component={AdminUsers} /></Route>
      <Route path="/admin/bots"><ProtectedRoute component={AdminBots} /></Route>
      <Route path="/admin/deployments"><ProtectedRoute component={AdminDeployments} /></Route>
      <Route path="/admin/support"><ProtectedRoute component={AdminSupport} /></Route>
      <Route path="/admin/support/:id"><ProtectedRoute component={AdminTicketDetail} /></Route>
      <Route path="/admin/audit-logs"><ProtectedRoute component={AdminAuditLogs} /></Route>
      <Route path="/admin/settings"><ProtectedRoute component={AdminSettings} /></Route>
      <Route path="/admin/payments"><ProtectedRoute component={AdminPaymentsPage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" attribute="class">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
            <BeraGuide />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
