import { createBrowserClient } from '@supabase/ssr';

// CAMBIO: se reemplaza createClient (de @supabase/supabase-js, sesión en
// localStorage) por createBrowserClient (de @supabase/ssr, sesión en
// cookies). El motivo es SSO real con leadhunter.devfreelancer.app —
// localStorage está aislado por origen exacto (ni compartiendo dominio
// padre se comparte), las cookies con `domain: '.devfreelancer.app'` sí
// se comparten entre devfreelancer.app y cualquier subdominio suyo.
//
// Vite expone las env vars vía import.meta.env, y solo las que empiezan
// por VITE_.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// CAMBIO: en localhost, domain: '.devfreelancer.app' haría que el
// navegador RECHACE la cookie por completo (un dominio no puede fijar
// una cookie para un dominio distinto al que sirve la página). Se
// detecta el hostname real y solo se aplica el dominio compartido en
// producción — en local, la sesión sigue funcionando igual que siempre,
// solo que atada a localhost en vez de compartida.
function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return '.devfreelancer.app';
}

const cookieDomain = getCookieDomain();

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: cookieDomain
    ? { domain: cookieDomain, sameSite: 'lax', secure: true }
    : undefined
});

export const getURL = (): string => {
  let url =
    import.meta.env.VITE_SITE_URL ??
    import.meta.env.VITE_VERCEL_URL ??
    'https://devfreelancer.app';
  url = url.includes('http') ? url : `https://${url}`;
  return url.replace(/\/$/, '');
};
