import { createClient } from '@supabase/supabase-js';

// En Next.js, las variables se acceden a través de process.env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
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
  // En Vercel, NEXT_PUBLIC_VERCEL_URL se define automáticamente
  let url = process.env.NEXT_PUBLIC_SITE_URL ?? 
            process.env.NEXT_PUBLIC_VERCEL_URL ?? 
            'https://devfreelancer.app';
            
  url = url.includes('http') ? url : `https://${url}`;
  return url.replace(/\/$/, "");
};
