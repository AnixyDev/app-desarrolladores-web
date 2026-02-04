import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { useAppStore } from "./hooks/useAppStore";
import { supabaseConfigError } from "@/lib/supabaseClient";
import AppLayout from "@/components/layout/AppLayout";

// Pages
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import TimeTrackingPage from "@/pages/TimeTrackingPage";
import BudgetsPage from "@/pages/BudgetsPage";
import ProposalsPage from "@/pages/ProposalsPage";
import ContractsPage from "@/pages/ContractsPage";
import InvoicesPage from "@/pages/InvoicesPage";
import CreateInvoicePage from "@/pages/CreateInvoicePage";
import ExpensesPage from "@/pages/ExpensesPage";
import TaxLedgerPage from "@/pages/TaxLedgerPage";
import ReportsPage from "@/pages/ReportsPage";
import ProfitabilityReportPage from "@/pages/ProfitabilityReportPage";
import ForecastingPage from "@/pages/ForecastingPage";
import JobMarketDashboard from "@/pages/JobMarketDashboard";
import JobDetailPage from "@/pages/JobDetailPage";
import SavedJobsPage from "@/pages/SavedJobsPage";
import MyApplicationsPage from "@/pages/MyApplicationsPage";
import JobPostForm from "@/pages/JobPostForm";
import MyJobPostsPage from "@/pages/MyJobPostsPage";
import JobApplicantsPage from "@/pages/JobApplicantsPage";
import AIAssistantPage from "@/pages/AIAssistantPage";
import TeamManagementDashboard from "@/pages/TeamManagementDashboard";
import RoleManagement from "@/pages/RoleManagement";
import KnowledgeBase from "@/pages/KnowledgeBase";
import MyTeamTimesheet from "@/pages/MyTeamTimesheet";
import SettingsPage from "@/pages/SettingsPage";
import PublicProfilePage from "@/pages/PublicProfilePage";
import BillingPage from "@/pages/BillingPage";
import IntegrationsManager from "@/pages/IntegrationsManager";
import AffiliateProgramPage from "@/pages/AffiliateProgramPage";
import AdminDashboard from "@/pages/AdminDashboard";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfService from "@/pages/TermsOfService";
import PortalDashboardPage from "@/pages/portal/PortalDashboardPage";
import PortalInvoiceViewPage from "@/pages/portal/PortalInvoiceViewPage";
import PortalProposalViewPage from "@/pages/portal/PortalProposalViewPage";
import PortalBudgetViewPage from "@/pages/portal/PortalBudgetViewPage";
import PortalContractViewPage from "@/pages/portal/PortalContractViewPage";

/**
 * Guard para rutas protegidas
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isProfileLoading } = useAppStore();

  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Cargando…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  useEffect(() => {
    if (supabaseConfigError) return;

    const cleanup = initializeAuth();
    return () => {
      cleanup();
    };
  }, [initializeAuth]);

  if (supabaseConfigError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-6">
        <div className="max-w-xl rounded-2xl border border-red-500/40 bg-gray-900/60 p-6 text-center space-y-3">
          <h1 className="text-2xl font-bold text-red-300">
            Configuración de Supabase incompleta
          </h1>
          <p className="text-sm text-gray-300">
            {supabaseConfigError} Revisa los valores en Vercel y vuelve a desplegar.
          </p>
          <div className="text-xs text-gray-400">
            <p>Variables requeridas:</p>
            <p className="font-mono">VITE_SUPABASE_URL</p>
            <p className="font-mono">VITE_SUPABASE_ANON_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />
        <Route path="/register" element={<Navigate to="/auth/register" replace />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/portal/:clientId" element={<PortalDashboardPage />} />
        <Route path="/portal/invoice/:invoiceId" element={<PortalInvoiceViewPage />} />
        <Route path="/portal/proposal/:proposalId" element={<PortalProposalViewPage />} />
        <Route path="/portal/budget/:budgetId" element={<PortalBudgetViewPage />} />
        <Route path="/portal/contract/:contractId" element={<PortalContractViewPage />} />

        {/* PROTECTED (layout) */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="time-tracking" element={<TimeTrackingPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="proposals" element={<ProposalsPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/create" element={<CreateInvoicePage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="tax-ledger" element={<TaxLedgerPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/profitability" element={<ProfitabilityReportPage />} />
          <Route path="forecasting" element={<ForecastingPage />} />
          <Route path="job-market" element={<JobMarketDashboard />} />
          <Route path="job-market/:jobId" element={<JobDetailPage />} />
          <Route path="saved-jobs" element={<SavedJobsPage />} />
          <Route path="my-applications" element={<MyApplicationsPage />} />
          <Route path="post-job" element={<JobPostForm />} />
          <Route path="my-job-posts" element={<MyJobPostsPage />} />
          <Route path="my-job-posts/:jobId/applicants" element={<JobApplicantsPage />} />
          <Route path="ai-assistant" element={<AIAssistantPage />} />
          <Route path="team" element={<TeamManagementDashboard />} />
          <Route path="roles" element={<RoleManagement />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="my-timesheet" element={<MyTeamTimesheet />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="public-profile" element={<PublicProfilePage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="integrations" element={<IntegrationsManager />} />
          <Route path="affiliate" element={<AffiliateProgramPage />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
