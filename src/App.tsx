import { lazy, Suspense, useCallback, useEffect, useState, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getMe, type AdminMe } from "./lib/api";
import { clearToken, getToken } from "./lib/session";
import { Layout } from "./components/Layout";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { ToastProvider } from "./components/Toast";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { IssuesPage } from "./pages/IssuesPage";
import { NewVersionPage } from "./pages/NewVersionPage";
import { SubscribersPage } from "./pages/SubscribersPage";
import { SupportPage } from "./pages/SupportPage";
import { FormsPage } from "./pages/FormsPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { PopupsPage } from "./pages/PopupsPage";
import { PricingPage } from "./pages/PricingPage";
import { ReleaseNotesPage } from "./pages/ReleaseNotesPage";
import { TestimonialsPage } from "./pages/TestimonialsPage";
import { ZinglesPage } from "./pages/ZinglesPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { BlogPage } from "./pages/BlogPage";
import { BlogEditorPage } from "./pages/BlogEditorPage";
import { BlogSubscribersPage } from "./pages/BlogSubscribersPage";
import { BlogSeriesPage } from "./pages/BlogSeriesPage";
import { BlogGuidesPage } from "./pages/BlogGuidesPage";
import { LogsPage } from "./pages/LogsPage";
import { CampaignPage } from "./pages/marketing/CampaignPage";
import { CampaignsPage } from "./pages/marketing/CampaignsPage";
import { FunnelPage } from "./pages/marketing/FunnelPage";
import { NewCampaignPage } from "./pages/marketing/NewCampaignPage";
import { PersonaListPage } from "./pages/marketing/PersonaListPage";
import { PersonaPage } from "./pages/marketing/PersonaPage";
import { TargetAudiencePage } from "./pages/marketing/TargetAudiencePage";
import { TemplateEditorPage } from "./pages/marketing/TemplateEditorPage";
import { TemplatesPage } from "./pages/marketing/TemplatesPage";
import { WhatsAppPage } from "./pages/marketing/whatsapp/WhatsAppPage";

// Documentation tab: only the viewer is in the bundle. The pages come from the staff-only API (see pages/DocsPage.tsx).
const DocsPage = lazy(() => import("./pages/DocsPage"));

type AuthState =
  | { kind: "loading" }
  | { kind: "out" }
  | { kind: "in"; me: AdminMe };

export function App(): ReactElement {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const { pathname } = useLocation();

  const check = useCallback(async () => {
    if (!getToken()) {
      setAuth({ kind: "out" });
      return;
    }
    try {
      const me = await getMe();
      setAuth(me.is_staff ? { kind: "in", me } : { kind: "out" });
    } catch {
      clearToken();
      setAuth({ kind: "out" });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signOut = () => {
    clearToken();
    setAuth({ kind: "out" });
  };

  if (auth.kind === "loading") {
    return <div className="boot">Loading…</div>;
  }

  if (auth.kind === "out") {
    return <LoginPage onSignedIn={check} />;
  }

  return (
    <ToastProvider>
      <Layout me={auth.me} onSignOut={signOut}>
        <PageErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<DashboardPage me={auth.me} />} />
            {/* Plan activation now lives in Subscribers (Waiting filter); keep old links working. */}
            <Route path="/activations" element={<Navigate to="/subscribers?status=waiting" replace />} />
            <Route path="/subscribers" element={<SubscribersPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/issues" element={<IssuesPage />} />
            <Route path="/new-version" element={<NewVersionPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/forms" element={<FormsPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="/marketing" element={<Navigate to="/marketing/funnel" replace />} />
            <Route path="/marketing/funnel" element={<FunnelPage />} />
            <Route path="/marketing/audience" element={<Navigate to="/marketing/persona" replace />} />
            <Route path="/marketing/persona" element={<PersonaListPage />} />
            <Route path="/marketing/persona/:id" element={<PersonaPage />} />
            <Route path="/marketing/persona/:id/audiences/new" element={<TargetAudiencePage />} />
            <Route path="/marketing/persona/:id/audiences/:aid" element={<TargetAudiencePage />} />
            <Route path="/marketing/templates" element={<Navigate to="/marketing/email/templates" replace />} />
            <Route path="/marketing/email/templates" element={<TemplatesPage />} />
            <Route path="/marketing/email/templates/new" element={<TemplateEditorPage />} />
            <Route path="/marketing/email/templates/:tid" element={<TemplateEditorPage />} />
            <Route path="/marketing/email" element={<CampaignsPage />} />
            <Route path="/marketing/email/new" element={<NewCampaignPage />} />
            <Route path="/marketing/email/:id" element={<CampaignPage />} />
            <Route path="/marketing/whatsapp" element={<WhatsAppPage />} />
            <Route path="/marketing/whatsapp/:tab" element={<WhatsAppPage />} />
            <Route path="/marketing/whatsapp/:tab/:id" element={<WhatsAppPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/popups" element={<PopupsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/whats-new" element={<ReleaseNotesPage />} />
            <Route path="/testimonials" element={<TestimonialsPage />} />
            <Route path="/zingles" element={<ZinglesPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/subscribers" element={<BlogSubscribersPage />} />
            <Route path="/blog/series" element={<BlogSeriesPage />} />
            <Route path="/blog/guides" element={<BlogGuidesPage />} />
            <Route path="/blog/:id" element={<BlogEditorPage />} />
            {/* Logs (FR-37): real data from /api/admin/logs/, in every build. */}
            <Route path="/logs" element={<LogsPage />} />
            <Route
              path="/docs/:slug?"
              element={
                <Suspense fallback={<p className="k">Loading…</p>}>
                  <DocsPage />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageErrorBoundary>
      </Layout>
    </ToastProvider>
  );
}
