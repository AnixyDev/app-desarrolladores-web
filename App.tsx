import React, { useEffect } from 'react';
import { useAppStore } from './hooks/useAppStore';
import AppRoutes from './routes'; // <--- Importamos el archivo que acabas de corregir

function App() {
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const isProfileLoading = useAppStore((state) => state.isProfileLoading);

  useEffect(() => {
    const unsubscribe = initializeAuth();
    return () => unsubscribe();
  }, [initializeAuth]);

  if (isProfileLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary-500"></div>
      </div>
    );
  }

  return <AppRoutes />; // <--- Un solo punto de control
}

export default App;