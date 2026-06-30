import { Switch, Route, Router as WouterRouter, Redirect, useSearch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { Loader2 } from "lucide-react";

const WORKER_ALLOWED_PATHS = ["/specification"];

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
import CompletedWorks from "@/pages/completed-works/index";

const queryClient = new QueryClient();

function ProgrammesRedirect() {
  const search = useSearch();
  return <Redirect to={`/programmes/infill${search || ""}`} />;
}

function ProtectedRoute({ component: Component, path, ...rest }: any) {
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

  // Field workers may only view /specification
  if (user.role === "field_worker" && path && !WORKER_ALLOWED_PATHS.some(p => path.startsWith(p))) {
    return <Redirect to="/specification" />;
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
      <Route path="/dashboard"><ProtectedRoute path="/dashboard" component={Dashboard} /></Route>
      <Route path="/assets/new"><ProtectedRoute path="/assets/new" component={NewAsset} /></Route>
      <Route path="/assets/:id"><ProtectedRoute path="/assets" component={AssetDetail} /></Route>
      <Route path="/assets"><ProtectedRoute path="/assets" component={Assets} /></Route>
      <Route path="/map"><ProtectedRoute path="/map" component={MapPage} /></Route>
      <Route path="/schedule"><ProtectedRoute path="/schedule" component={Schedule} /></Route>
      <Route path="/reactive-jobs"><ProtectedRoute path="/reactive-jobs" component={ReactiveJobs} /></Route>
      <Route path="/audits/new"><ProtectedRoute path="/audits" component={NewAudit} /></Route>
      <Route path="/audits/:id/edit"><ProtectedRoute path="/audits" component={EditAudit} /></Route>
      <Route path="/audits/:id"><ProtectedRoute path="/audits" component={AuditDetail} /></Route>
      <Route path="/audits"><ProtectedRoute path="/audits" component={Audits} /></Route>
      <Route path="/programmes/infill"><ProtectedRoute path="/programmes" component={Programmes} /></Route>
      <Route path="/programmes/mulching"><ProtectedRoute path="/programmes" component={Programmes} /></Route>
      <Route path="/programmes"><ProgrammesRedirect /></Route>
      <Route path="/reports"><ProtectedRoute path="/reports" component={Reports} /></Route>
      <Route path="/audit-log"><ProtectedRoute path="/audit-log" component={AuditLog} /></Route>
      <Route path="/users"><ProtectedRoute path="/users" component={Users} /></Route>
      <Route path="/settings"><ProtectedRoute path="/settings" component={Settings} /></Route>
      <Route path="/team"><ProtectedRoute path="/team" component={Team} /></Route>
      <Route path="/specification"><ProtectedRoute path="/specification" component={Specification} /></Route>
      <Route path="/completed-works"><ProtectedRoute path="/completed-works" component={CompletedWorks} /></Route>
      <Route path="/">
        <ProtectedRoute path="/" component={() => {
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
