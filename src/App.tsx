import { lazy, Suspense, useState, useEffect, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { toast } from './hooks/useToast';
import { isQuotaError, friendlyTaskError, serializeError } from './lib/utils';
import { TooltipProvider } from './components/ui/tooltip';
import { AppShell } from './components/layout/AppShell';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/common/ToastProvider';
import { SubmitFailureRouter } from './components/common/SubmitFailureRouter';
import { QUERY_STALE_TIME } from './lib/constants';
import { initDeepLinkContext, readDeepLinkParams } from './lib/deepLink';
import { ConfigurationProvider, useEffectiveAdminRole } from './providers/ConfigurationProvider';
import { Loader2, AlertTriangle } from 'lucide-react';

// COORDINATION [HIGH-RISK]: Adding a route requires updating Sidebar.tsx NAV_SECTIONS in the same commit.
// Open and assign a GitHub Issue before editing this file. See CONTRIBUTING.md §Shared Files.

// --- Overview ---
const DashboardPage = lazy(() =>
  import('./pages/Dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);

// --- Intake & Requests ---
const IntakeListPage = lazy(() =>
  import('./pages/Intake/IntakeListPage').then((m) => ({ default: m.IntakeListPage }))
);
const IntakeDetailPage = lazy(() =>
  import('./pages/Intake/IntakeDetailPage').then((m) => ({ default: m.IntakeDetailPage }))
);

// --- Project Portfolio ---
const ProjectListPage = lazy(() =>
  import('./pages/Projects/ProjectListPage').then((m) => ({ default: m.ProjectListPage }))
);
const ProjectDetailPage = lazy(() =>
  import('./pages/Projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage }))
);
const ProgramListPage = lazy(() =>
  import('./pages/Programs/ProgramListPage').then((m) => ({ default: m.ProgramListPage }))
);
const ProgramDetailPage = lazy(() =>
  import('./pages/Programs/ProgramDetailPage').then((m) => ({ default: m.ProgramDetailPage }))
);

// --- Project Health ---
const StatusReportListPage = lazy(() =>
  import('./pages/StatusReports/StatusReportListPage').then((m) => ({ default: m.StatusReportListPage }))
);

// --- Analytics ---
const AnalyticsHubPage = lazy(() =>
  import('./pages/Analytics/AnalyticsHubPage').then((m) => ({ default: m.AnalyticsHubPage }))
);
const ByTeamPage = lazy(() =>
  import('./pages/Analytics/ByTeamPage').then((m) => ({ default: m.ByTeamPage }))
);
const PipelinePage = lazy(() =>
  import('./pages/Analytics/PipelinePage').then((m) => ({ default: m.PipelinePage }))
);
const HealthPage = lazy(() =>
  import('./pages/Analytics/HealthPage').then((m) => ({ default: m.HealthPage }))
);
const SchedulePage = lazy(() =>
  import('./pages/Analytics/SchedulePage').then((m) => ({ default: m.SchedulePage }))
);
const IntakePipelinePage = lazy(() =>
  import('./pages/Analytics/IntakePipelinePage').then((m) => ({ default: m.IntakePipelinePage }))
);
const RoutingQaPage = lazy(() =>
  import('./pages/Analytics/RoutingQaPage').then((m) => ({ default: m.RoutingQaPage }))
);

const GovernancePage = lazy(() =>
  import('./pages/Analytics/GovernancePage').then((m) => ({ default: m.GovernancePage }))
);
const CapacityPage = lazy(() =>
  import('./pages/Analytics/CapacityPage').then((m) => ({ default: m.CapacityPage }))
);
const PrioritizationPage = lazy(() =>
  import('./pages/Analytics/PrioritizationPage').then((m) => ({ default: m.PrioritizationPage }))
);
const ScenarioPage = lazy(() =>
  import('./pages/Analytics/ScenarioPage').then((m) => ({ default: m.ScenarioPage }))
);
const FinancialPage = lazy(() =>
  import('./pages/Analytics/FinancialPage').then((m) => ({ default: m.FinancialPage }))
);
const RoadmapPage = lazy(() =>
  import('./pages/Analytics/RoadmapPage').then((m) => ({ default: m.RoadmapPage }))
);
const VariancePage = lazy(() =>
  import('./pages/Analytics/VariancePage').then((m) => ({ default: m.VariancePage }))
);
const IntakeAnalyticsPage = lazy(() =>
  import('./pages/Analytics/IntakeAnalyticsPage').then((m) => ({ default: m.IntakeAnalyticsPage }))
);

// --- Feedback ---
const FeedbackForm = lazy(() =>
  import('./pages/Intake/FeedbackForm').then((m) => ({ default: m.FeedbackForm }))
);
const UserFeedbackPage = lazy(() =>
  import('./pages/Admin/UserFeedbackPage').then((m) => ({ default: m.UserFeedbackPage }))
);
const UserFeedbackDetailPage = lazy(() =>
  import('./pages/Admin/UserFeedbackDetailPage').then((m) => ({ default: m.UserFeedbackDetailPage }))
);

// --- Administration ---
const TeamsPage = lazy(() =>
  import('./pages/Teams/TeamsPage').then((m) => ({ default: m.TeamsPage }))
);
const AdminSettingsPage = lazy(() =>
  import('./pages/Admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage }))
);
const ChangeHistoryPage = lazy(() =>
  import('./pages/Admin/ChangeHistoryPage').then((m) => ({ default: m.ChangeHistoryPage }))
);

// Global mutation-error handler. Every React Query mutation that throws routes through
// here — we surface a single, user-friendly toast instead of leaving each call site to
// craft its own. Quota errors get a longer-lived warning toast since waiting is the only
// recourse; everything else gets a standard error toast with the parsed message.
const mutationCache = new MutationCache({
  onError: (err) => {
    // Stage 5: PSS task-update failures are surfaced by the FailedSavesTray
    // with a Retry button. The queue marks those errs with __handledByTray
    // so we don't show a duplicate transient toast for the same failure.
    if (err && typeof err === 'object' && (err as { __handledByTray?: boolean }).__handledByTray) {
      return;
    }
    const raw = serializeError(err);
    if (isQuotaError(raw)) {
      toast.warning(friendlyTaskError(raw));
      return;
    }
    toast.error(friendlyTaskError(raw));
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      retry: 1,
    },
  },
  mutationCache,
});

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}

function DeepLinkStartup() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (checked) return;
    Promise.all([initDeepLinkContext(), readDeepLinkParams()])
      .then(([, state]) => {
        if (!state) return;
        let path = `/${state.page}`;
        if (state.id) path += `/${state.id}`;
        const params = new URLSearchParams();
        if (state.tab) params.set('tab', state.tab);
        if (state.subtab) params.set('subtab', state.subtab);
        if (state.task) params.set('task', state.task);
        if (state.view) params.set('view', state.view);
        const qs = params.toString();
        navigate(qs ? `${path}?${qs}` : path, { replace: true });
      })
      .finally(() => setChecked(true));
  }, [navigate, checked]);
  return null;
}

function NotFoundPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-4">
      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      <p className="text-2xl font-semibold text-foreground">Page not found</p>
      <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
      <button onClick={() => navigate(-1)} className="text-xs text-primary underline underline-offset-2">Go back</button>
    </div>
  );
}

function AdminRoute({ children }: { children: ReactNode }) {
  const role = useEffectiveAdminRole();
  if (role === 'none') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ConfigurationProvider>
          <ToastProvider>
            <TooltipProvider>
              <HashRouter>
                <DeepLinkStartup />
                <SubmitFailureRouter />
                <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<AppShell />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />

                    {/* Overview */}
                    <Route path="dashboard" element={<DashboardPage />} />

                    {/* Intake & Requests */}
                    <Route path="intake" element={<IntakeListPage />} />
                    <Route path="intake/new" element={<IntakeDetailPage />} />
                    <Route path="intake/feedback/bug" element={<FeedbackForm type="bug" />} />
                    <Route path="intake/feedback/enhancement" element={<FeedbackForm type="enhancement" />} />
                    <Route path="intake/:id" element={<IntakeDetailPage />} />

                    {/* Project Portfolio */}
                    <Route path="projects" element={<ProjectListPage />} />
                    <Route path="projects/:id" element={<ProjectDetailPage />} />
                    <Route path="programs" element={<ProgramListPage />} />
                    <Route path="programs/:id" element={<ProgramDetailPage />} />

                    {/* Project Health */}
                    <Route path="status-reports" element={<StatusReportListPage />} />

                    {/* Analytics */}
                    <Route path="analytics" element={<AnalyticsHubPage />} />
                    <Route path="analytics/by-team" element={<ByTeamPage />} />
                    <Route path="analytics/pipeline" element={<PipelinePage />} />
                    <Route path="analytics/health" element={<HealthPage />} />
                    <Route path="analytics/schedule" element={<SchedulePage />} />
                    <Route path="analytics/intake" element={<IntakePipelinePage />} />
                    <Route path="analytics/routing-qa" element={<RoutingQaPage />} />
                    <Route path="analytics/governance" element={<GovernancePage />} />
                    <Route path="analytics/capacity" element={<CapacityPage />} />
                    <Route path="analytics/prioritization" element={<PrioritizationPage />} />
                    <Route path="analytics/scenarios" element={<ScenarioPage />} />
                    <Route path="analytics/financials" element={<FinancialPage />} />
                    <Route path="analytics/variance" element={<VariancePage />} />
                    <Route path="analytics/roadmap" element={<RoadmapPage />} />
                    <Route path="analytics/intake-pipeline" element={<IntakeAnalyticsPage />} />

                    {/* Administration */}
                    <Route path="teams" element={<TeamsPage />} />
                    <Route path="admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
                    <Route path="admin/change-history" element={<AdminRoute><ChangeHistoryPage /></AdminRoute>} />
                    <Route path="admin/user-feedback" element={<AdminRoute><UserFeedbackPage /></AdminRoute>} />
                    <Route path="admin/user-feedback/:id" element={<AdminRoute><UserFeedbackDetailPage /></AdminRoute>} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
                </Suspense>
              </HashRouter>
            </TooltipProvider>
          </ToastProvider>
        </ConfigurationProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
