import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AppErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UsersPage from "@/pages/users";
import OrdersPage from "@/pages/orders";
import DriverQueuePage from "@/pages/driver-queue";
import PaymentsPage from "@/pages/payments";
import RevenuePage from "@/pages/revenue";
import AnnouncementsPage from "@/pages/announcements";
import DisputesPage from "@/pages/disputes";
import RejectedDriversPage from "@/pages/rejected-drivers";
import SuspendedDriversPage from "@/pages/suspended-drivers";
import BannedDriversPage from "@/pages/banned-drivers";
import ExpiredAccountsPage from "@/pages/expired-accounts";
import SupportChatPage from "@/pages/support-chat";
import AuditLogPage from "@/pages/audit-log";
import SuspensionRequestsPage from "@/pages/suspension-requests";
import ReferralRewardsPage from "@/pages/referral-rewards";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/driver-queue" component={DriverQueuePage} />
      <Route path="/payments" component={PaymentsPage} />
      <Route path="/revenue" component={RevenuePage} />
      <Route path="/announcements" component={AnnouncementsPage} />
      <Route path="/disputes" component={DisputesPage} />
      <Route path="/support" component={SupportChatPage} />
      <Route path="/rejected-drivers" component={RejectedDriversPage} />
      <Route path="/suspended-drivers" component={SuspendedDriversPage} />
      <Route path="/banned-drivers" component={BannedDriversPage} />
      <Route path="/expired-accounts" component={ExpiredAccountsPage} />
      <Route path="/audit-log" component={AuditLogPage} />
      <Route path="/suspension-requests" component={SuspensionRequestsPage} />
      <Route path="/referral-rewards" component={ReferralRewardsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Tracks whether the currently-signed-in Supabase user is on the
  // admin_users allowlist. `undefined` = still checking, `null` = checked
  // and rejected, `true` = confirmed admin.
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(undefined);
      return;
    }

    let cancelled = false;
    setIsAdmin(undefined);

    // A valid Supabase session is NOT enough — 16+ real customer/driver
    // accounts also have valid sessions. Only allow through if this user
    // id is on the admin_users allowlist; otherwise sign them out
    // immediately so they can't linger with a rejected-but-active session.
    supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRejectedMessage("هذا الحساب غير مصرح له بالدخول إلى لوحة الإدارة.");
          await supabase.auth.signOut();
          if (!cancelled) setIsAdmin(false);
          return;
        }
        setIsAdmin(true);
      });

    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined || (session && isAdmin === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session || isAdmin === false) {
    return <LoginPage errorMessage={rejectedMessage} />;
  }

  return (
    <AppLayout>
      <Router />
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate />
          </WouterRouter>
          <Toaster />
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
