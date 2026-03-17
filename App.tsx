import React, { useEffect } from 'react';
import { useAppStore } from './hooks/useAppStore';
import { supabaseConfigError } from '@/lib/supabaseClient';
import AppRoutes from './routes'; // Importamos tu sistema de rutas centralizado

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const isProfileLoading = useAppStore((state) => state.isProfileLoading);

  useEffect(() => {
    // Si hay un error de config (faltan variables .env), no intentamos conectar
    if (supabaseConfigError) return;

    // Inicializamos la escucha de sesión de Supabase
    const unsubscribe = initializeAuth();
    
    // Cleanup al desmontar el componente
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [initializeAuth]);

  // ESCENARIO A: Error Crítico de Configuración (Variables de entorno faltantes)
  if (supabaseConfigError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-6">
        <div className="max-w-xl rounded-2xl border border-red-500/40 bg-gray-900/60 p-6 text-center space-y-3">
          <h1 className="text-2xl font-bold text-red-300">Configuración incompleta</h1>
          <p className="text-sm text-gray-300">
            {supabaseConfigError} Revisa los valores en Vercel/GitHub y vuelve a desplegar.
          </p>
          <div className="text-xs text-gray-400 font-mono">
            VITE_SUPABASE_URL | VITE_SUPABASE_ANON_KEY
          </div>
        </div>
      </div>
    );
  }

  // ESCENARIO B: Cargando Perfil/Sesión
  if (isProfileLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary-500"></div>
      </div>
    );
  }

  // ESCENARIO C: Todo OK -> Renderizamos las rutas
  return <AppRoutes />;
};

export default App;