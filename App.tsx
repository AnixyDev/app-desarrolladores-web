import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './hooks/useAppStore';

// Layouts
import { AppLayout } from './components/layout/AppLayout';
import AuthLayout from './pages/auth/AuthLayout';
import PortalLayout from './pages/portal/PortalLayout';

// Páginas
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ProjectPage from './pages/ProjectPage'; // Importación corregida (singular)
import ClientsPage from './pages/ClientsPage';
import InvoicesPage from './pages/InvoicesPage';
import AIAssistantPage from './pages/AIAssistantPage';
import SettingsPage from './pages/SettingsPage';

// Portal del Cliente
import PortalDashboardPage from './pages/portal/PortalDashboardPage';
import PortalLoginPage from './pages/portal/PortalLoginPage';

function App() {
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const isProfileLoading = useAppStore((state) => state.isProfileLoading);

  useEffect(() => {
    const unsubscribe = initializeAuth();
    return () => unsubscribe();
  }, [initializeAuth]);

  if (isProfileLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* RUTAS PÚBLICAS / AUTH */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} />
        <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" replace />} />
      </Route>

      {/* RUTAS PRIVADAS (APP DESARROLLADOR) */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectPage />} /> 
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* RUTAS DEL PORTAL DEL CLIENTE */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<PortalDashboardPage />} />
      </Route>

      {/* REDIRECCIÓN POR DEFECTO */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;