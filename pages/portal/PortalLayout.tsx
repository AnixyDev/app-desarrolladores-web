import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface PortalClient {
  client_id: string;
  client_name: string;
}

const PortalLayout: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [client, setClient] = useState<PortalClient | null>(null);
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setHasSession(false);
        setLoading(false);
        return;
      }
      setHasSession(true);

      // Vincula (o recupera el vínculo ya existente) del cliente para este email
      const { data, error } = await supabase.rpc('link_portal_client');

      if (error || !data || data.length === 0) {
        // El email no coincide con ningún cliente dado de alta por el freelancer
        setLinkError(true);
      } else {
        setClient({ client_id: data[0].client_id, client_name: data[0].client_name });
      }
      setLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setHasSession(false);
        setClient(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!hasSession) {
    return <Navigate to="/portal/login" replace />;
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Sin acceso asociado</h2>
          <p className="text-gray-400">
            Tu email no está vinculado a ningún proyecto todavía. Contacta con tu freelancer
            para que confirme la dirección de email dada de alta.
          </p>
          <button onClick={handleLogout} className="text-primary-400 hover:underline text-sm">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Portal de Cliente</h1>
          <div className="flex items-center gap-4">
            {client && <span className="text-sm text-gray-400">{client.client_name}</span>}
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* El contexto pasa el client_id a las páginas hijas (facturas, presupuestos, etc.) */}
        <Outlet context={{ clientId: client?.client_id }} />
      </main>
    </div>
  );
};

export default PortalLayout;