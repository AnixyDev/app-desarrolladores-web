import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
