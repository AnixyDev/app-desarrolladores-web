import { createClient } from '@supabase/supabase-js';

// Vite expone las env vars vía import.meta.env, y solo las que empiezan por VITE_
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'devfl-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const getURL = (): string => {
  // VITE_VERCEL_URL es el nombre que usa Vercel para exponer la URL del deployment
  // en proyectos Vite/no-Next.js cuando activas "Automatically expose System Environment Variables"
  let url =
    import.meta.env.VITE_SITE_URL ??
    import.meta.env.VITE_VERCEL_URL ??
    'https://devfreelancer.app';

  url = url.includes('http') ? url : `https://${url}`;
  return url.replace(/\/$/, '');
};
