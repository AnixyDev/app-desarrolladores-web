// Portal con varias fichas: una misma persona puede ser cliente de varios
// freelancers (o tener dos fichas con el mismo email). link_portal_client()
// devuelve todas; aquí se decide cuál se está viendo.

export interface FichaDelPortal {
  client_id: string;
  client_name: string;
  ownerBusinessName: string | null;
  ownerFullName: string | null;
  ownerLogoUrl: string | null;
  ownerBrandColor: string | null;
}

const CLAVE = 'portal:cliente';

const TABLA_DE_RUTA: Record<string, string> = {
  contracts: 'contracts',
  invoices: 'invoices',
  budgets: 'budgets',
  proposals: 'proposals',
  projects: 'projects',
};

/** ¿La ruta es un documento concreto? Devuelve la tabla y el id. */
export const documentoDeLaRuta = (ruta: string): { tabla: string; id: string } | null => {
  const m = /^\/portal\/(contracts|invoices|budgets|proposals|projects)\/([A-Za-z0-9-]+)\/?$/.exec(ruta);
  return m ? { tabla: TABLA_DE_RUTA[m[1]], id: m[2] } : null;
};

export const nombreDelFreelancer = (f: FichaDelPortal): string =>
  f.ownerBusinessName || f.ownerFullName || 'Portal de Cliente';

export const leerFichaPreferida = (): string | null => {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
};

export const guardarFichaPreferida = (id: string): void => {
  try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento */ }
};

/** La ficha que se abre al entrar: la última elegida si sigue enlazada; si no, la primera. */
export const fichaInicial = (fichas: FichaDelPortal[], preferida: string | null): FichaDelPortal | null =>
  fichas.find(f => f.client_id === preferida) ?? fichas[0] ?? null;
