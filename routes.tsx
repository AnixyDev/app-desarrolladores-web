import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import { AppLayout } from './components/layout/AppLayout';
import AuthLayout from './pages/auth/AuthLayout';
import PortalLayout from './pages/portal/PortalLayout';

// ── Auth ────────────────────────────────────────────────────────────────────
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// ── App core ────────────────────────────────────────────────────────────────
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';

// ── Finanzas ────────────────────────────────────────────────────────────────
import InvoicesPage from './pages/InvoicesPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import ExpensesPage from './pages/ExpensesPage';
import TaxLedgerPage from './pages/TaxLedgerPage';

// ── Ventas ──────────────────────────────────────────────────────────────────
import BudgetsPage from './pages/BudgetsPage';
import ContractsPage from './pages/ContractsPage';

// ── Tiempo ──────────────────────────────────────────────────────────────────
import TimeTrackingPage from './pages/TimeTrackingPage';

// ── Análisis y Reportes ─────────────────────────────────────────────────────
import ReportsPage from './pages/ReportsPage';
import ProfitabilityReportPage from './pages/ProfitabilityReportPage';
import ForecastingPage from './pages/ForecastingPage';

// ── Marketplace ─────────────────────────────────────────────────────────────
import JobMarketDashboard from './pages/JobMarketDashboard';
import JobDetailPage from './pages/JobDetailPage';
import JobPostForm from './pages/JobPostForm';
import JobApplicantsPage from './pages/JobApplicantsPage';
import SavedJobsPage from './pages/SavedJobsPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import MyJobPostsPage from './pages/MyJobPostsPage';

// ── IA ───────────────────────────────────────────────────────────────────────
import AIAssistantPage from './pages/AIAssistantPage';

// ── Equipo ───────────────────────────────────────────────────────────────────
import TeamManagementDashboard from './pages/TeamManagementDashboard';
import RoleManagement from './pages/RoleManagement';
import KnowledgeBase from './pages/KnowledgeBase';
import MyTeamTimesheet from './pages/MyTeamTimesheet';

// ── Configuración ─────────────────────────────────────────────────────────────
import SettingsPage from './pages/SettingsPage';
import PublicProfilePage from './pages/PublicProfilePage';
import BillingPage from './pages/BillingPage';
import IntegrationsManager from './pages/IntegrationsManager';
import AffiliateProgramPage from './pages/AffiliateProgramPage';

// ── Admin ─────────────────────────────────────────────────────────────────────
import AdminDashboard from './pages/AdminDashboard';

// ── Legal / Público ───────────────────────────────────────────────────────────
import LandingPage from './pages/LandingPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfService from './pages/TermsOfService';

// ── Portal de cliente ─────────────────────────────────────────────────────────
import PortalLoginPage from './pages/portal/PortalLoginPage';
import PortalDashboardPage from './pages/portal/PortalDashboardPage';
import PortalInvoiceViewPage from './pages/portal/PortalInvoiceViewPage';
import PortalBudgetViewPage from './pages/portal/PortalBudgetViewPage';
import PortalContractViewPage from './pages/portal/PortalContractViewPage';
import PortalProposalViewPage from './pages/portal/PortalProposalViewPage';
import PortalProjectFilesPage from './pages/portal/PortalProjectFilesPage';

// ─────────────────────────────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  return (
    <Routes>

      {/* ── Rutas públicas ─────────────────────────────────────────────── */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfService />} />

      {/* ── Auth ───────────────────────────────────────────────────────── */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* ── Portal de cliente (layout propio) ──────────────────────────── */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<PortalDashboardPage />} />
        <Route path="invoices/:id" element={<PortalInvoiceViewPage />} />
        <Route path="budgets/:id" element={<PortalBudgetViewPage />} />
        <Route path="contracts/:id" element={<PortalContractViewPage />} />
        <Route path="proposals/:id" element={<PortalProposalViewPage />} />
        <Route path="projects/:id/files" element={<PortalProjectFilesPage />} />
      </Route>

      {/* ── Admin ──────────────────────────────────────────────────────── */}
      {/* NOTA: añade aquí tu guard de rol de admin si aplica */}
      <Route path="/admin" element={<AppLayout />}>
        <Route index element={<AdminDashboard />} />
      </Route>

      {/* ── Rutas protegidas ───────────────────────────────────────────── */}
      <Route element={<AppLayout />}>

        {/* Dashboard */}
        <Route path="/" element={<DashboardPage />} />

        {/* Proyectos */}
        <Route path="/projects" element={<ProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />

        {/* Clientes */}
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />

        {/* Time tracking */}
        <Route path="/time-tracking" element={<TimeTrackingPage />} />

        {/* Ventas */}
        <Route path="/budgets" element={<BudgetsPage />} />
        {/*
          AVISO: pages/ProposalsPage.tsx contiene por error el código de
          PortalProposalViewPage. Necesitas crear una ProposalsPage real
          o usar el componente correcto. Por ahora esta ruta está comentada
          para evitar un export incorrecto en producción.
        */}
        {/* <Route path="/proposals" element={<ProposalsPage />} /> */}
        <Route path="/contracts" element={<ContractsPage />} />

        {/* Finanzas */}
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/new" element={<CreateInvoicePage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/tax-ledger" element={<TaxLedgerPage />} />

        {/* Análisis y Reportes */}
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/profitability" element={<ProfitabilityReportPage />} />
        <Route path="/forecasting" element={<ForecastingPage />} />

        {/* Marketplace */}
        <Route path="/job-market" element={<JobMarketDashboard />} />
        <Route path="/job-market/:id" element={<JobDetailPage />} />
        <Route path="/job-market/:id/applicants" element={<JobApplicantsPage />} />
        <Route path="/post-job" element={<JobPostForm />} />
        <Route path="/saved-jobs" element={<SavedJobsPage />} />
        <Route path="/my-applications" element={<MyApplicationsPage />} />
        <Route path="/my-job-posts" element={<MyJobPostsPage />} />

        {/* Asistente IA */}
        <Route path="/ai-assistant" element={<AIAssistantPage />} />

        {/* Equipo */}
        <Route path="/team" element={<TeamManagementDashboard />} />
        <Route path="/roles" element={<RoleManagement />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/my-timesheet" element={<MyTeamTimesheet />} />

        {/* Configuración */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/public-profile" element={<PublicProfilePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/integrations" element={<IntegrationsManager />} />
        <Route path="/affiliate" element={<AffiliateProgramPage />} />

      </Route>

      {/* ── Fallback ───────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  );
};

export default AppRoutes;
