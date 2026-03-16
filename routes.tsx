// routes.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Auth
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// App core
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectPage';
import ClientsPage from './pages/ClientsPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';

// Optional but existing
import ReportsPage from './pages/ReportsPage';
import ProposalsPage from './pages/ProposalsPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* App */}
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/clients" element={<ClientsPage />} />
      <Route path="/invoices" element={<InvoicesPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/proposals" element={<ProposalsPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
