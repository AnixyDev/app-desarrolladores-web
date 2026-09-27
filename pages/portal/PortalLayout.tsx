import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { destinoValido, loginConDestino, recogerDestino } from '@/lib/destinoPortal';
import {
  type FichaDelPortal, documentoDeLaRuta, fichaInicial, guardarFichaPreferida,
  leerFichaPreferida, nombreDelFreelancer,
} from '@/lib/portalClientes';

const DEFAULT_BRAND_COLOR = '#d9009f';

export const esRutaDeLoginDelPortal = (ruta: string): boolean =>
  ruta.replace(/\/+$/, '') === '/portal/login';

const PortalLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  // Todas las fichas de esta persona (puede ser cliente de varios
  // freelancers) y la que se está viendo.
  const [fichas, setFichas] = useState<FichaDelPortal[]>([]);
  const [client, setClient] = useState<FichaDelPortal | null>(null);
  // Mientras se averigua de qué ficha es el documento abierto, no se pinta:
  // la página hija buscaría el documento en la ficha equivocada.
  const [rutaResuelta, setRutaResuelta] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  // Página a la que iba el cliente antes de iniciar sesión (p. ej. el contrato
  // del correo). Se calcula una sola vez: recogerDestino() la borra al leerla.
  const destino = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setHasSession(false);
        setLoading(false);
        return;
      }
      setHasSession(true);

      // Enlaza (o recupera) todas las fichas de cliente con este email, con la
      // marca (logo, nombre, color) del freelancer de cada una.
      const { data, error } = await supabase.rpc('link_portal_client');

      if (error || !data || data.length === 0) {
        setLinkError(true);
      } else {
        const lista: FichaDelPortal[] = (data as Array<Record<string, string | null>>).map(row => ({
          client_id: String(row.client_id),
          client_name: String(row.client_name ?? ''),
          ownerBusinessName: row.owner_business_name,
          ownerFullName: row.owner_full_name,
          ownerLogoUrl: row.owner_logo_url,
          ownerBrandColor: row.owner_brand_color,
        }));
        setFichas(lista);
        setClient(fichaInicial(lista, leerFichaPreferida()));
      }
      setLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setHasSession(false);
        setClient(null);
        setFichas([]);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // Con varias fichas, un enlace a un documento (el contrato del correo) abre
  // la ficha a la que pertenece ese documento, sea del freelancer que sea.
  useEffect(() => {
    const doc = documentoDeLaRuta(location.pathname);
    if (!doc || fichas.length < 2) return;
    let vigente = true;
    const ruta = location.pathname;
    (async () => {
      try {
        const { data } = await supabase.from(doc.tabla).select('client_id').eq('id', doc.id).maybeSingle();
        const suya = fichas.find(f => f.client_id === (data as { client_id?: string } | null)?.client_id);
        if (vigente && suya) {
          setClient(actual => (actual?.client_id === suya.client_id ? actual : suya));
          guardarFichaPreferida(suya.client_id);
        }
      } finally {
        if (vigente) setRutaResuelta(ruta);
      }
    })();
    return () => { vigente = false; };
  }, [location.pathname, fichas]);

  const cambiarDeFicha = (id: string) => {
    const nueva = fichas.find(f => f.client_id === id);
    if (!nueva) return;
    setClient(nueva);
    guardarFichaPreferida(nueva.client_id);
    navigate('/portal/dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  const resolviendo =
    fichas.length > 1 && documentoDeLaRuta(location.pathname) !== null && rutaResuelta !== location.pathname;

  if (loading || resolviendo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  // La página de login del portal cuelga de este mismo layout (App.tsx), así
  // que sin sesión hay que DEJARLA PINTARSE. Antes se redirigía siempre a
  // /portal/login, también estando ya en /portal/login: una redirección a sí
  // misma que nunca llegaba a pintar el <Outlet />. Resultado, desde julio:
  // pantalla negra para todo cliente sin sesión — justo a donde manda el
  // correo de invitación al portal.
  const enLogin = esRutaDeLoginDelPortal(location.pathname);

  if (!hasSession) {
    if (enLogin) {
      return (
        <div className="min-h-screen bg-gray-900 text-gray-100">
          <Outlet />
        </div>
      );
    }
    // Se lleva la página pedida (`?next=`) y el email, si el enlace lo traía,
    // para volver a ella después de entrar.
    const email = new URLSearchParams(location.search).get('email');
    return <Navigate to={loginConDestino(location.pathname, email)} replace />;
  }

  const enRaiz = location.pathname === '/portal' || location.pathname === '/portal/';

  // Con sesión, el formulario de acceso no pinta nada. Y al volver del enlace
  // mágico (que siempre aterriza en /portal) se va a la página que se pidió
  // antes de iniciar sesión, si la hay; si no, al panel.
  if (enLogin || enRaiz) {
    if (destino.current === undefined) {
      destino.current = destinoValido(new URLSearchParams(location.search).get('next')) ?? recogerDestino();
    }
    return <Navigate to={destino.current ?? '/portal/dashboard'} replace />;
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

  const brandName = client ? nombreDelFreelancer(client) : 'Portal de Cliente';
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
            {fichas.length > 1 && client ? (
              <label className="text-sm text-gray-400 flex items-center gap-2">
                <span className="hidden sm:inline">Freelancer:</span>
                <select
                  aria-label="Cambiar de freelancer"
                  value={client.client_id}
                  onChange={(e) => cambiarDeFicha(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200 max-w-[11rem] truncate"
                >
                  {fichas.map(f => (
                    <option key={f.client_id} value={f.client_id}>{nombreDelFreelancer(f)}</option>
                  ))}
                </select>
              </label>
            ) : (
              client && <span className="text-sm text-gray-400 hidden sm:inline">{client.client_name}</span>
            )}
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* El contexto pasa el client_id y los datos del freelancer dueño a
            las páginas hijas. IMPORTANTE: las páginas del portal (factura,
            contrato, presupuesto, propuesta...) deben usar este contexto y
            consultas directas a Supabase filtradas por clientId, NUNCA el
            store global (useAppStore) — ese store está scoped a la sesión
            del FREELANCER (auth.uid() = user_id vía RLS) y para la sesión
            OTP de un cliente siempre está vacío. */}
        <Outlet context={{
          clientId: client?.client_id,
          brandColor,
          ownerBusinessName: client?.ownerBusinessName,
          ownerFullName: client?.ownerFullName,
        }} />
      </main>
    </div>
  );
};

export default PortalLayout;