import { createClient } from '@supabase/supabase-js';

// Acceso seguro a las variables de entorno (compatible con TS estricto y Vite)
const env = (import.meta as any).env;
const SUPABASE_URL: string = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY;

// Error de configuración exportado para que App.tsx pueda mostrarlo en pantalla
// antes de intentar cualquier conexión a Supabase.
export const supabaseConfigError: string | null =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Faltan variables de entorno para Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    : null;

// Cliente singleton con configuración robusta para RLS y OAuth con PKCE
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'devfl-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// URL base de la app (usada en callbacks OAuth y emails de Supabase)
export const getURL = (): string => {
  let url: string =
    import.meta.env.VITE_SITE_URL ??
    import.meta.env.VITE_VERCEL_URL ??
    'https://devfreelancer.app';

  url = url.includes('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url.slice(0, -1) : url;
  return url;
};
