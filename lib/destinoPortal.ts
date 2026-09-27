// A dónde iba el cliente del portal antes de tener que iniciar sesión.
//
// El correo de un contrato lleva a /portal/contracts/<id>. Sin sesión, el
// portal manda al login, y hasta ahora esa dirección se perdía: tras pulsar el
// enlace mágico el cliente acababa en el panel, no en el contrato que tenía
// que firmar.
//
// Ahora el login recibe la página de destino en `?next=` y la guarda en el
// navegador antes de pedir el enlace mágico (el enlace vuelve siempre a
// /portal, que es la dirección permitida en Supabase). Al volver con sesión,
// el portal la recupera y lleva al cliente allí.

const CLAVE = 'portal:destino';
const CADUCIDAD_MS = 60 * 60 * 1000; // el enlace mágico caduca en 1 hora

/**
 * Solo páginas internas del portal. Nada de dominios externos (`//evil.com`,
 * `https://…`, `/\evil.com`) ni del propio login, que daría un bucle.
 */
export const destinoValido = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const ruta = valor.trim();
  if (!/^\/portal\/[A-Za-z0-9/_-]+$/.test(ruta)) return null;
  if (ruta.includes('//')) return null;
  const limpia = ruta.replace(/\/+$/, '');
  if (limpia === '/portal/login') return null;
  return limpia;
};

/** Dirección de login que recuerda a dónde se iba. */
export const loginConDestino = (ruta: string, email?: string | null): string => {
  const params = new URLSearchParams();
  const destino = destinoValido(ruta);
  if (destino && destino !== '/portal/dashboard') params.set('next', destino);
  const correo = (email ?? '').trim();
  if (correo) params.set('email', correo);
  const q = params.toString();
  return q ? `/portal/login?${q}` : '/portal/login';
};

export const guardarDestino = (ruta: unknown): void => {
  const destino = destinoValido(ruta);
  try {
    if (destino) localStorage.setItem(CLAVE, JSON.stringify({ destino, hasta: Date.now() + CADUCIDAD_MS }));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento (modo privado estricto): el cliente acabará en el panel.
  }
};

/** Devuelve el destino pendiente (si no ha caducado) y lo borra. */
export const recogerDestino = (): string | null => {
  try {
    const crudo = localStorage.getItem(CLAVE);
    localStorage.removeItem(CLAVE);
    if (!crudo) return null;
    const { destino, hasta } = JSON.parse(crudo) as { destino?: unknown; hasta?: unknown };
    if (typeof hasta !== 'number' || hasta < Date.now()) return null;
    return destinoValido(destino);
  } catch {
    return null;
  }
};
