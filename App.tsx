import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import { useAppStore } from "./hooks/useAppStore";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import AppLayout from "@/components/layout/AppLayout";

// Pages
import LandingPage from "@/pages/LandingPage"; // <--- NUEVA IMPORTACIÓN
import LoginPage from "@/pages/auth/LoginPage";
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

/* ---------------- App.tsx (Versión Corregida) ---------------- */

// ... (todas tus importaciones igual)

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isProfileLoading } = useAppStore();

  // Solo mostramos carga si estamos REALMENTE esperando el perfil, 
  // pero dejamos pasar si ya sabemos que no está autenticado.
  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="animate-pulse">Cargando sistema...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
};

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  useEffect(() => {
    if (supabaseConfigError) return;
    const cleanup = initializeAuth();
    return () => { cleanup?.(); };
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* RUTA RAÍZ: Siempre accesible */}
        <Route path="/" element={<LandingPage />} />

        {/* RUTAS DE AUTH: Deben ser accesibles SIEMPRE que no estés logueado */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        
        {/* Redirecciones simples */}
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />
        <Route path="/register" element={<Navigate to="/auth/register" replace />} />
        
        {/* LEGALES */}
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* PORTAL CLIENTES */}
        <Route path="/portal/:clientId" element={<PortalDashboardPage />} />
        <Route path="/portal/invoice/:invoiceId" element={<PortalInvoiceViewPage />} />

        {/* RUTAS PROTEGIDAS (Solo tras login) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            {/* ... resto de tus rutas protegidas ... */}
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Catch-all: Si no existe, al inicio */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
