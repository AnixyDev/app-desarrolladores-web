import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import { useAppStore } from "./hooks/useAppStore";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
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
 * Guard de rutas protegidas
 */
const ProtectedRoute = () => {
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

  return <Outlet />;
};

const App = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  /**
   * 👉 FIX OAuth Google / Supabase
   * Procesa ?code=... cuando Supabase vuelve al /
   */
  useEffect(() => {
    if (supabaseConfigError) return;

    const run = async () => {
      const url = window.location.href;

      if (url.includes("code=")) {
        try {
          await supabase.auth.exchangeCodeForSession(url);
        } finally {
          // Limpia la URL (quita ?code=...)
          window.history.replaceState({}, "", "/");
