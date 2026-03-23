import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env;
const SUPABASE_URL: string = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigError: string | null =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Faltan variables de entorno para Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    : null;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'devfl-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const getURL = (): string => {
  let url: string =
    import.meta.env.VITE_SITE_URL ??
    import.meta.env.VITE_VERCEL_URL ??
    'https://devfreelancer.app';
  url = url.includes('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url.slice(0, -1) : url;
  return url;
};
