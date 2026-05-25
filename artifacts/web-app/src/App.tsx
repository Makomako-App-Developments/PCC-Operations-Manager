import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { Loader2 } from "lucide-react";

// Placeholder imports for pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Assets from "@/pages/assets/index";
import NewAsset from "@/pages/assets/new";
import AssetDetail from "@/pages/assets/detail";
import Schedule from "@/pages/schedule";
import ReactiveJobs from "@/pages/reactive-jobs";
import Audits from "@/pages/audits/index";
import NewAudit from "@/pages/audits/new";
import AuditDetail from "@/pages/audits/detail";
import EditAudit from "@/pages/audits/edit";
import Programmes from "@/pages/programmes/index";
import Reports from "@/pages/reports";
import AuditLog from "@/pages/audit-log/index";
import Users from "@/pages/users/index";
import Specification from "@/pages/specification/index";
import Team from "@/pages/team/index";
import Settings from "@/pages/settings/index";
import MapPage from "@/pages/map";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // AuthProvider redirects to /login
  }

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/assets"><ProtectedRoute component={Assets} /></Route>
      <Route path="/assets/new"><ProtectedRoute component={NewAsset} /></Route>
      <Route path="/assets/:id"><ProtectedRoute component={AssetDetail} /></Route>
      <Route path="/map"><ProtectedRoute component={MapPage} /></Route>
      <Route path="/schedule"><ProtectedRoute component={Schedule} /></Route>
      <Route path="/reactive-jobs"><ProtectedRoute component={ReactiveJobs} /></Route>
      <Route path="/audits/new"><ProtectedRoute component={NewAudit} /></Route>
      <Route path="/audits/:id/edit"><ProtectedRoute component={EditAudit} /></Route>
      <Route path="/audits/:id"><ProtectedRoute component={AuditDetail} /></Route>
      <Route path="/audits"><ProtectedRoute component={Audits} /></Route>
      <Route path="/programmes"><ProtectedRoute component={Programmes} /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
      <Route path="/audit-log"><ProtectedRoute component={AuditLog} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/team"><ProtectedRoute component={Team} /></Route>
      <Route path="/specification"><ProtectedRoute component={Specification} /></Route>
      <Route path="/">
        <ProtectedRoute component={() => {
          window.location.href = "/dashboard";
          return null;
        }} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
