import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { supabase } from '@/lib/supabaseClient';
import { useAppStore } from '@/hooks/useAppStore';

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const logoutAction = useAppStore(state => state.logout);

  useEffect(() => {
    // Escuchamos cambios en el estado de autenticación de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Si detectamos que la sesión se cerró, limpiamos y redirigimos
        if (logoutAction) logoutAction();
        localStorage.clear();
        navigate('/auth/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, logoutAction]);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* El contenedor main suele llevar una clase para el scroll suave */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
