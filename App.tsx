import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAppStore } from "./hooks/useAppStore";

// Layouts
import AppLayout from "./components/layout/AppLayout";

// Páginas Públicas
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfService from "./pages/TermsOfService";

// Páginas Privadas
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import ProjectsPage from "./pages/ProjectsPage";
import InvoicesPage from "./pages/InvoicesPage";
import SettingsPage from "./pages/SettingsPage";
import TimeTrackingPage from "./pages/TimeTrackingPage"; 
import ExpensesPage from "./pages/ExpensesPage";       
import AIAssistantPage from "./pages/AIAssistantPage";
import TaxLedgerPage from "./pages/TaxLedgerPage";
import BudgetsPage from "./pages/BudgetsPage";
import ProposalsPage from "./pages/ProposalsPage";
import ContractsPage from "./pages/ContractsPage";
import ReportsPage from "./pages/ReportsPage";
import ProfitabilityReportPage from "./pages/ProfitabilityReportPage";
import ForecastingPage from "./pages/ForecastingPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import BillingPage from "./pages/BillingPage";

const ProtectedRoute = () => {
  const { isAuthenticated, isProfileLoading } = useAppStore();
  
  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary-500 mb-4"></div>
        <span className="text-primary-500 font-black italic">DEVFREELANCER...</span>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/auth/login" replace />;
};

const App: React.FC = () => {
  const { isAuthenticated, initializeAuth } = useAppStore();

  useEffect(() => {
    const cleanup = initializeAuth();
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas Públicas */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/auth/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/auth/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* Rutas Protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/time-tracking" element={<TimeTrackingPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/tax-ledger" element={<TaxLedgerPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/profitability" element={<ProfitabilityReportPage />} />
            <Route path="/forecasting" element={<ForecastingPage />} />
            <Route path="/ai-assistant" element={<AIAssistantPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/public-profile" element={<PublicProfilePage />} />
            <Route path="/billing" element={<BillingPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;