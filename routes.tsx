import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts (no lazy - necesarios inmediatamente)
import { AppLayout } from './components/layout/AppLayout';
import AuthLayout from './pages/auth/AuthLayout';
import PortalLayout from './pages/portal/PortalLayout';

// Spinner de carga
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen w-full bg-gray-950">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
  </div>
);

// Auth
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

// App core
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));

// Finanzas
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const CreateInvoicePage = lazy(() => import('./pages/CreateInvoicePage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const TaxLedgerPage = lazy(() => import('./pages/TaxLedgerPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
// Ventas
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const ProposalsPage = lazy(() => import('./pages/ProposalsPage'));
const ContractsPage = lazy(() => import('./pages/ContractsPage'));

// Tiempo
const TimeTrackingPage = lazy(() => import('./pages/TimeTrackingPage'));

// Análisis y Reportes
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ProfitabilityReportPage = lazy(() => import('./pages/ProfitabilityReportPage'));
const ForecastingPage = lazy(() => import('./pages/ForecastingPage'));

// Marketplace
const JobMarketDashboard = lazy(() => import('./pages/JobMarketDashboard'));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'));
const JobPostForm = lazy(() => import('./pages/JobPostForm'));
const JobApplicantsPage = lazy(() => import('./pages/JobApplicantsPage'));
const SavedJobsPage = lazy(() => import('./pages/SavedJobsPage'));
const MyApplicationsPage = lazy(() => import('./pages/MyApplicationsPage'));
const MyJobPostsPage = lazy(() => import('./pages/MyJobPostsPage'));

// IA
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));

// Equipo
const TeamManagementDashboard = lazy(() => import('./pages/TeamManagementDashboard'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const MyTeamTimesheet = lazy(() => import('./pages/MyTeamTimesheet'));

// Configuración
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const IntegrationsManager = lazy(() => import('./pages/IntegrationsManager'));
const AffiliateProgramPage = lazy(() => import('./pages/AffiliateProgramPage'));

// Admin
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Legal / Público
const LandingPage = lazy(() => import('./pages/LandingPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));

// Portal de cliente
const PortalLoginPage = lazy(() => import('./pages/portal/PortalLoginPage'));
const PortalDashboardPage = lazy(() => import('./pages/portal/PortalDashboardPage'));
const PortalInvoiceViewPage = lazy(() => import('./pages/portal/PortalInvoiceViewPage'));
const PortalBudgetViewPage = lazy(() => import('./pages/portal/PortalBudgetViewPage'));
const PortalContractViewPage = lazy(() => import('./pages/portal/PortalContractViewPage'));
const PortalProposalViewPage = lazy(() => import('./pages/portal/PortalProposalViewPage'));
const PortalProjectFilesPage = lazy(() => import('./pages/portal/PortalProjectFilesPage'));

const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Portal de cliente (layout propio) */}
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalDashboardPage />} />
          <Route path="invoices/:id" element={<PortalInvoiceViewPage />} />
          <Route path="budgets/:id" element={<PortalBudgetViewPage />} />
          <Route path="contracts/:id" element={<PortalContractViewPage />} />
          <Route path="proposals/:id" element={<PortalProposalViewPage />} />
          <Route path="projects/:id/files" element={<PortalProjectFilesPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<AppLayout />}>
          <Route index element={<AdminDashboard />} />
        </Route>

        {/* Rutas protegidas */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/proposals" element={<ProposalsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/tax-ledger" element={<TaxLedgerPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/profitability" element={<ProfitabilityReportPage />} />
          <Route path="/forecasting" element={<ForecastingPage />} />
          <Route path="/job-market" element={<JobMarketDashboard />} />
          <Route path="/job-market/:id" element={<JobDetailPage />} />
          <Route path="/job-market/:id/applicants" element={<JobApplicantsPage />} />
          <Route path="/post-job" element={<JobPostForm />} />
          <Route path="/saved-jobs" element={<SavedJobsPage />} />
          <Route path="/my-applications" element={<MyApplicationsPage />} />
          <Route path="/my-job-posts" element={<MyJobPostsPage />} />
          <Route path="/ai-assistant" element={<AIAssistantPage />} />
          <Route path="/team" element={<TeamManagementDashboard />} />
          <Route path="/roles" element={<RoleManagement />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/my-timesheet" element={<MyTeamTimesheet />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/public-profile" element={<PublicProfilePage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/integrations" element={<IntegrationsManager />} />
          <Route path="/affiliate" element={<AffiliateProgramPage />} />
          <Route path="/inbox" element={<InboxPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
