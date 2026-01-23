import { createClient } from '@supabase/supabase-js';

// FIX: Access import.meta.env using bracket notation and casting to avoid TS errors in environments where types are not strictly defined.
const env = (import.meta as any).env;
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

/**
 * Devuelve la URL base oficial del proyecto.
 */
export const getURL = () => {
  // FIX: Access import.meta.env properties safely to avoid "Property 'env' does not exist on type 'ImportMeta'"
  let url =
    env.VITE_SITE_URL ?? 
    env.VITE_VERCEL_URL ?? 
    window.location.origin;
  url = url.includes('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url : `${url}/`;
  return url;
};

// Cliente singleton con configuración robusta para RLS
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storageKey: 'devfl-auth-token', 
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
    }
});