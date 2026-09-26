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
// CAMBIO: antes esto era "si el host NO es exactamente 'localhost', usa
// .devfreelancer.app". Eso rompia el login en todo lo demas:
//   - 127.0.0.1 (el propio Vite lo ofrece como segunda URL)
//   - la IP de la red local (probar desde el movil con --host)
//   - los despliegues de vista previa de Vercel (*.vercel.app)
// En todos esos casos el navegador RECHAZA la cookie, porque una pagina no
// puede fijar una cookie para un dominio que no es el suyo. Resultado: el
// login devuelve 200, la sesion no se guarda en ninguna parte y la app te
// devuelve a la pantalla de acceso sin decir por que.
// Ahora se invierte la condicion: el dominio compartido solo se aplica
// cuando la pagina SE SIRVE desde devfreelancer.app o un subdominio suyo,
// que es el unico caso en que el navegador lo aceptaria.
function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  if (host === 'devfreelancer.app' || host.endsWith('.devfreelancer.app')) {
    return '.devfreelancer.app';
  }
  return undefined;
}

const cookieDomain = getCookieDomain();

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: cookieDomain
    ? { domain: cookieDomain, sameSite: 'lax', secure: true }
    : undefined
});

// La dirección a la que Supabase devuelve al usuario desde un correo (p. ej.
// el de restablecer contraseña). En el navegador es SIEMPRE la de la página
// en la que está: antes se tomaba VITE_VERCEL_URL, que en Vercel es la URL
// interna de cada despliegue (app-desarrolladores-xxxx.vercel.app). Supabase
// la rechazaba por no estar en su lista de direcciones permitidas y mandaba
// al usuario a la portada, donde no había formulario de contraseña nueva.
export const getURL = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  let url =
    import.meta.env.VITE_SITE_URL ??
    'https://devfreelancer.app';
  url = url.includes('http') ? url : `https://${url}`;
  return url.replace(/\/$/, '');
};
