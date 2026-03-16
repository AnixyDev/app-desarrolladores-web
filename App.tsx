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
  const { isAuthenticated, isProfileLoading, initializeAuth } = useAppStore();

  useEffect(() => {
    const cleanup = initializeAuth();
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [initializeAuth]);

  // Bloqueo de renderizado global hasta que la sesión sea verificada
  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-t-4 border-b-4 border-primary-500 animate-spin"></div>
          <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-t-4 border-b-4 border-primary-200 opacity-20"></div>
        </div>
        <span className="mt-4 text-primary-500 font-black italic tracking-tighter animate-pulse">
          DEVFREELANCER...
        </span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Lógica de redirección inteligente en rutas públicas */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/auth/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        
        {/* ... resto de tus rutas protegidas con ProtectedRoute ... */}
      </Routes>
    </BrowserRouter>
  );
};
