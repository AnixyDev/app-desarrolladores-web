import React, { useEffect, useState } from 'react';
import { useAppStore } from './hooks/useAppStore';
import { supabaseConfigError } from '@/lib/supabaseClient';
import AppRoutes from './routes';

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const isProfileLoading = useAppStore((state) => state.isProfileLoading);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (supabaseConfigError) {
        console.error('Supabase Config Error:', supabaseConfigError);
        return;
      }
      const unsubscribe = initializeAuth();
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    } catch (err: any) {
      setRuntimeError(err.message || 'Unknown initialization error');
      console.error('Runtime Error during init:', err);
    }
  }, [initializeAuth]);

  // Pantalla de Error Crítico (Variables de Entorno o Configuración)
  if (supabaseConfigError || runtimeError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-red-500/50 rounded-xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
            ⚠️ Error de Inicialización
          </h1>
          <div className="bg-black/30 rounded-lg p-4 mb-6 font-mono text-sm text-red-200 break-words">
            {supabaseConfigError || runtimeError}
          </div>
          <p className="text-slate-400 text-sm mb-6">
            La aplicación no pudo iniciarse. Verifica las variables de entorno en Vercel y asegúrate de que el proyecto de Supabase esté activo.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            Reintentar Carga
          </button>
        </div>
      </div>
    );
  }

  if (isProfileLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          <p className="text-slate-500 font-medium animate-pulse">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
};

export default App;
