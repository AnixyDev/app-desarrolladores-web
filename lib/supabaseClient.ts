import { createClient } from '@supabase/supabase-js';

<<<<<<< HEAD
// FIX: Access import.meta.env using bracket notation and casting to avoid TS errors in environments where types are not strictly defined.
const env = (import.meta as any).env;
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigError =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Faltan variables de entorno para Supabase.'
    : null;
=======
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
>>>>>>> main

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// AÑADE ESTA FUNCIÓN AL FINAL DEL ARCHIVO
export const getURL = () => {
  let url =
    import.meta.env.VITE_SITE_URL ?? // Configura esto en Vercel si quieres
    import.meta.env.VITE_VERCEL_URL ?? // Vercel lo da automáticamente
    'https://devfreelancer.app'; // Tu dominio final
  
  // Asegúrate de incluir http/https
  url = url.includes('http') ? url : `https://${url}`;
  // Quita la barra final si la tiene
  url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url;
  return url;
};
<<<<<<< HEAD

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
=======
>>>>>>> main
