import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import Sidebar from './Sidebar';
import Header from './Header';

export const AppLayout: React.FC = () => {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Si no está autenticado, mandamos al login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <Outlet /> {/* Aquí se cargan las páginas como DashboardPage, etc. */}
          </div>
        </main>
      </div>
    </div>
  );
};