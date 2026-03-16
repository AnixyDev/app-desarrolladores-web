import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Auth
import LoginPage from './pages/LoginPage'; // Ajustado a la ruta correcta
import RegisterPage from './pages/auth/RegisterPage';

// App core
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage'; // Nombre corregido (sin S)
import ClientsPage from './pages/ClientsPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';
import AIAssistantPage from './pages/AIAssistantPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* App con Layout (Si usas AppLayout, envuélvelas aquí) */}
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects" element={<ProjectPage />} />
      <Route path="/clients" element={<ClientsPage />} />
      <Route path="/invoices" element={<InvoicesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/ai-assistant" element={<AIAssistantPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;