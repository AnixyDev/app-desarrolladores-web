import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout'; // IMPORTANTE: El guardián visual

// Auth
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// App core
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage';
import ClientsPage from './pages/ClientsPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';
import AIAssistantPage from './pages/AIAssistantPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* RUTAS PÚBLICAS: Cualquiera puede entrar */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* RUTAS PROTEGIDAS: Solo si estás logueado y dentro del Layout profesional */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
      </Route>

      {/* Fallback: Si la ruta no existe, mandamos al inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes; AppRoutes;
