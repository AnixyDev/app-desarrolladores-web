import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from './hooks/useAppStore';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import ToastContainer from './components/ui/Toast';
import CookieBanner from './components/ui/CookieBanner';

// Auth & Public
import AuthLayout from './pages/auth/AuthLayout';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/auth/RegisterPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfService from './pages/TermsOfService';

const safeLazy = (importFn: () => Promise<any>) => {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      console.error("Fallo de carga de módulo:", error);
      window.location.reload();
      throw error;
    }
  });
};

const DashboardPage = safeLazy(() => import('./pages/DashboardPage'));
const ClientsPage = safeLazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = safeLazy(() => import('./pages/ClientDetailPage'));
const ProjectPage = safeLazy(() => import('./pages/ProjectPage'));
const ProjectDetailPage = safeLazy(() => import('./pages/ProjectDetailPage'));
const InvoicesPage = safeLazy(() => import('./pages/InvoicesPage'));
const CreateInvoicePage = safeLazy(() => import('./pages/CreateInvoicePage'));
const ExpensesPage = safeLazy(() => import('./pages/ExpensesPage'));
const BudgetsPage = safeLazy(() => import('./pages/BudgetsPage'));
const ProposalsPage = safeLazy(() => import('./pages/ProposalsPage'));
const ContractsPage = safeLazy(() => import('./pages/ContractsPage'));
const TimeTrackingPage = safeLazy(() => import('./pages/TimeTrackingPage'));
const ReportsPage = safeLazy(() => import('./pages/ReportsPage'));
const ProfitabilityReportPage = safeLazy(() => import('./pages/ProfitabilityReportPage'));
const TaxLedgerPage = safeLazy(() => import('./pages/TaxLedgerPage'));
const AIAssistantPage = safeLazy(() => import('./pages/AIAssistantPage'));
const JobMarketDashboard = safeLazy(() => import('./pages/JobMarketDashboard'));
const JobDetailPage = safeLazy(() => import('./pages/JobDetailPage'));
const JobPostForm = safeLazy(() => import('./pages/JobPostForm'));
const JobApplicantsPage = safeLazy(() => import('./pages/JobApplicantsPage'));
const MyJobPostsPage = safeLazy(() => import('./pages/MyJobPostsPage'));
const PublicProfilePage = safeLazy(() => import('./pages/PublicProfilePage'));
const MyApplicationsPage = safeLazy(() => import('./pages/MyApplicationsPage'));
const SavedJobsPage = safeLazy(() => import('./pages/SavedJobsPage'));
const TeamManagementDashboard = safeLazy(() => import('./pages/TeamManagementDashboard'));
const MyTeamTimesheet = safeLazy(() => import('./pages/MyTeamTimesheet'));
const KnowledgeBase = safeLazy(() => import('./pages/KnowledgeBase'));
const InboxPage = safeLazy(() => import('./pages/InboxPage'));
const RoleManagement = safeLazy(() => import('./pages/RoleManagement'));
const IntegrationsManager = safeLazy(() => import('./pages/IntegrationsManager'));
const ForecastingPage = safeLazy(() => import('./pages/ForecastingPage'));
const AffiliateProgramPage = safeLazy(() => import('./pages/AffiliateProgramPage'));
const BillingPage = safeLazy(() => import('./pages/BillingPage'));
const PortalBrandingPage = safeLazy(() => import('./pages/PortalBrandingPage'));
const SettingsPage = safeLazy(() => import('./pages/SettingsPage'));
const AdminDashboard = safeLazy(() => import('./pages/AdminDashboard'));

const PortalLayout = safeLazy(() => import('./pages/portal/PortalLayout'));
const PortalLoginPage = safeLazy(() => import('./pages/portal/PortalLoginPage'));
const PortalDashboardPage = safeLazy(() => import('./pages/portal/PortalDashboardPage'));
const PortalInvoiceViewPage = safeLazy(() => import('./pages/portal/PortalInvoiceViewPage'));

const LoadingFallback = () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-950">
        <div className="w-12 h-12 border-[3px] border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
    </div>
);

const MainLayout = () => {
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    return (
        <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden font-sans selection:bg-primary-500/30">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="flex-1 flex flex-col min-w-0">
    <Header onMenuClick={() => setSidebarOpen(true)} />

    <main className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8 animate-fade-in">
                    <Suspense fallback={<div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div></div>}>
                        <Outlet />
                    </Suspense>
                </main>
            </div>
        </div>
    );
};

function App() {
    const { initializeAuth, isAuthenticated, isProfileLoading } = useAppStore();
    
    useEffect(() => {
        console.log("🎬 App.tsx: Inicializando autenticación...");
        initializeAuth();
    }, [initializeAuth]);

    if (isProfileLoading) {
        console.log("⏳ App.tsx: Cargando perfil...");
        return <LoadingFallback />;
    }

    console.log("✅ App.tsx: Renderizando rutas. isAuthenticated =", isAuthenticated);

    return (
            <>
                <ToastContainer />
                <CookieBanner />
                <Routes>
                    <Route path="/auth" element={<AuthLayout />}>
                        <Route path="login" element={<LoginPage />} />
                        <Route path="register" element={<RegisterPage />} />
                        <Route index element={<Navigate to="login" replace />} />
                    </Route>
                    
                    <Route path="/portal" element={<Suspense fallback={<LoadingFallback />}><PortalLayout /></Suspense>}>
                        <Route path="login" element={<PortalLoginPage />} />
                        <Route path="dashboard/:clientId" element={<PortalDashboardPage />} />
                        <Route path="invoice/:invoiceId" element={<PortalInvoiceViewPage />} />
                        <Route index element={<Navigate to="login" replace />} />
                    </Route>

                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    
                    <Route 
                        path="/" 
                        element={isAuthenticated ? <MainLayout /> : <LandingPage />}
                    >
                        <Route index element={<DashboardPage />} />
                        <Route path="clients" element={<ClientsPage />} />
                        <Route path="clients/:clientId" element={<ClientDetailPage />} />
                        <Route path="projects" element={<ProjectPage />} />
                        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
                        <Route path="invoices" element={<InvoicesPage />} />
                        <Route path="invoices/create" element={<CreateInvoicePage />} />
                        <Route path="expenses" element={<ExpensesPage />} />
                        <Route path="budgets" element={<BudgetsPage />} />
                        <Route path="proposals" element={<ProposalsPage />} />
                        <Route path="contracts" element={<ContractsPage />} />
                        <Route path="time-tracking" element={<TimeTrackingPage />} />
                        <Route path="reports" element={<ReportsPage />} />
                        <Route path="reports/profitability" element={<ProfitabilityReportPage />} />
                        <Route path="tax-ledger" element={<TaxLedgerPage />} />
                        <Route path="ai-assistant" element={<AIAssistantPage />} />
                        <Route path="job-market" element={<JobMarketDashboard />} />
                        <Route path="job-market/:jobId" element={<JobDetailPage />} />
                        <Route path="job-market/:jobId/applicants" element={<JobApplicantsPage />} />
                        <Route path="post-job" element={<JobPostForm />} />
                        <Route path="my-job-posts" element={<MyJobPostsPage />} />
                        <Route path="public-profile" element={<PublicProfilePage />} />
                        <Route path="my-applications" element={<MyApplicationsPage />} />
                        <Route path="saved-jobs" element={<SavedJobsPage />} />
                        <Route path="team" element={<TeamManagementDashboard />} />
                        <Route path="my-timesheet" element={<MyTeamTimesheet />} />
                        <Route path="knowledge-base" element={<KnowledgeBase />} />
                        <Route path="inbox" element={<InboxPage />} />
                        <Route path="roles" element={<RoleManagement />} />
                        <Route path="integrations" element={<IntegrationsManager />} />
                        <Route path="forecasting" element={<ForecastingPage />} />
                        <Route path="affiliate" element={<AffiliateProgramPage />} />
                        <Route path="billing" element={<BillingPage />} />
                        <Route path="portal-branding" element={<PortalBrandingPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="admin" element={<AdminDashboard />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
           </>
    );
}

export default App;