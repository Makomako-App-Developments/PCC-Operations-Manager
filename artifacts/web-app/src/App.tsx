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
import Schedule from "@/pages/schedule";
import Jobs from "@/pages/jobs";
import ReactiveJobs from "@/pages/reactive-jobs";

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
      <Route path="/schedule"><ProtectedRoute component={Schedule} /></Route>
      <Route path="/jobs"><ProtectedRoute component={Jobs} /></Route>
      <Route path="/reactive-jobs"><ProtectedRoute component={ReactiveJobs} /></Route>
      <Route path="/">
        <ProtectedRoute component={() => {
          // Redirect from root to dashboard
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
