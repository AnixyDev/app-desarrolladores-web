import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from '../ErrorBoundary';

export const AppLayout: React.FC = () => {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const isProfileLoading = useAppStore((state) => state.isProfileLoading); // 🆕
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 🆕 Mientras se confirma la sesión (refresh de página, primera carga), NO decidimos nada todavía.
  // Antes: solo se miraba isAuthenticated, que arranca en `false` y provoca el redirect prematuro.
  if (isProfileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Solo redirigimos a landing cuando YA sabemos con certeza que no hay sesión
  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};