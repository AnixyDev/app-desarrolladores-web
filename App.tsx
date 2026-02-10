import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAppStore } from "./hooks/useAppStore";

// Layouts
import AppLayout from "./components/layout/AppLayout";

// Páginas Públicas (Verificadas en tu captura)
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfService from "./pages/TermsOfService";
// Nota: Si RegisterPage está dentro de una subcarpeta auth, asegúrate que la ruta sea esta:
import RegisterPage from "./pages/auth/RegisterPage"; 

// Páginas Privadas (Nombres exactos de tu imagen)
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import ProjectsPage from "./pages/ProjectsPage";
import InvoicesPage from "./pages/InvoicesPage";
import SettingsPage from "./pages/SettingsPage";
import TimeTrackingPage from "./pages/TimeTrackingPage"; 
import ExpensesPage from "./pages/ExpensesPage";       
import AIAssistantPage from "./pages/AIAssistantPage";
import TaxLedgerPage from "./pages/TaxLedgerPage";

/* --- Guardián de Rutas --- */
const ProtectedRoute = () => {
  const { isAuthenticated, isProfileLoading } = useAppStore();

  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary-500"></div>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/auth/login" replace />;
};

/* --- Componente Principal --- */
const App: React.FC = () => {
  const { isAuthenticated, initializeAuth } = useAppStore();

  useEffect(() => {
    const cleanup = initializeAuth();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route 
          path="/" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} 
        />
        <Route 
          path="/auth/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} 
        />
        <Route 
          path="/auth/register" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />} 
        />
        
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* RUTAS PROTEGIDAS (Panel de Control) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/tasks" element={<TimeTrackingPage />} />
            <Route path="/finances" element={<ExpensesPage />} />
            <Route path="/taxes" element={<TaxLedgerPage />} />
            <Route path="/ai-assistant" element={<AIAssistantPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Redirección automática si la ruta no existe */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;