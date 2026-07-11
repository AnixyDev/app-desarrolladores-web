import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface PortalClient {
  client_id: string;
  client_name: string;
  // FIX / NUEVO: marca del freelancer dueño de este cliente, para el portal
  // con marca blanca — antes el portal siempre mostraba el genérico
  // "Portal de Cliente" sin ningún logo ni nombre de negocio.
  ownerBusinessName: string | null;
  ownerFullName: string | null;
  ownerLogoUrl: string | null;
  ownerBrandColor: string | null;
}

const DEFAULT_BRAND_COLOR = '#d9009f';

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

      // Vincula (o recupera el vínculo ya existente) del cliente para este email.
      // link_portal_client() ahora también devuelve la marca (logo, nombre,
      // color) del freelancer dueño de este cliente.
      const { data, error } = await supabase.rpc('link_portal_client');

      if (error || !data || data.length === 0) {
        setLinkError(true);
      } else {
        const row = data[0];
        setClient({
          client_id: row.client_id,
          client_name: row.client_name,
          ownerBusinessName: row.owner_business_name,
          ownerFullName: row.owner_full_name,
          ownerLogoUrl: row.owner_logo_url,
          ownerBrandColor: row.owner_brand_color,
        });
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

  const brandName = client?.ownerBusinessName || client?.ownerFullName || 'Portal de Cliente';
  const brandColor = client?.ownerBrandColor || DEFAULT_BRAND_COLOR;

  return (
    // La variable CSS --portal-brand-color permite que cualquier página hija
    // del portal (facturas, presupuestos, contratos...) use la marca del
    // freelancer en acentos/botones sin tener que volver a pedir el dato.
    <div className="min-h-screen bg-gray-900 text-gray-100" style={{ '--portal-brand-color': brandColor } as React.CSSProperties}>
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {client?.ownerLogoUrl ? (
              <img
                src={client.ownerLogoUrl}
                alt={brandName}
                className="h-9 w-9 rounded-lg object-cover border border-gray-800"
              />
            ) : (
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">{brandName}</h1>
              <p className="text-[11px] text-gray-500 leading-tight">Portal de Cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {client && <span className="text-sm text-gray-400 hidden sm:inline">{client.client_name}</span>}
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* El contexto pasa el client_id (y la marca) a las páginas hijas */}
        <Outlet context={{ clientId: client?.client_id, brandColor }} />
      </main>
    </div>
  );
};

export default PortalLayout;