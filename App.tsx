import React, { useEffect } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import AppRoutes from './routes';

const App: React.FC = () => {
  const initializeAuth = useAppStore((state) => state.initializeAuth);

  useEffect(() => {
    const cleanup = initializeAuth();

    // 🆕 Red de seguridad: si por lo que sea la carga de sesión no termina
    // en 6 segundos, forzamos isProfileLoading a false para no dejar
    // al usuario atrapado en un spinner infinito.
    const safetyTimer = setTimeout(() => {
      const state = useAppStore.getState();
      if (state.isProfileLoading) {
        console.warn('Auth initialization tardó demasiado, forzando salida del loading.');
        useAppStore.setState({ isProfileLoading: false });
      }
    }, 6000);

    return () => {
      cleanup();
      clearTimeout(safetyTimer);
    };
  }, [initializeAuth]);

  return <AppRoutes />;
};

export default App;