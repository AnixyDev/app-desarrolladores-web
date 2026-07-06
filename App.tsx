import React, { useEffect } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import AppRoutes from './routes';

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  useEffect(() => {
    // initializeAuth() arranca la comprobación de sesión y devuelve una función
    // de limpieza (probablemente desuscribe el listener de onAuthStateChange).
    const cleanup = initializeAuth();
    return cleanup;
  }, [initializeAuth]);

  return <AppRoutes />;
};

export default App;