// Plan Fundadores: Freelancer Pro a 59 €/año para siempre, solo para los 50
// primeros clientes y hasta el 31/12/2026 a las 23:59 (hora de Madrid).
//
// TODO el recuento sale de Stripe, que es quien cobra: Supabase no guarda el
// precio de cada suscripción y un webhook retrasado daría un número falso.
//
// Plazas ocupadas = suscripciones con el precio de fundadores en active,
// trialing o past_due + pagos de fundadores abiertos en Stripe (cada uno
// reserva su plaza mientras dura, 30 minutos como mucho). Así, si queda una
// plaza y dos personas pulsan casi a la vez, la segunda ya ve la reserva de la
// primera y se le dice que no quedan.
//
// Este archivo no importa nada de Deno ni de la red: Stripe se recibe como
// parámetro. Lo cargan las Edge Functions y vitest.

/** Clave de búsqueda del precio en Stripe (la misma en modo prueba y real). */
export const LOOKUP_KEY_FUNDADORES = 'pro_anual_fundadores';

/** itemKey que viaja en el metadata del pago y que lee el webhook. */
export const ITEM_KEY_FUNDADORES = 'proPlanFundadores';

export const PLAZAS_TOTALES = 50;

/**
 * Cierre de la oferta: 31/12/2026 a las 23:59:59 en Madrid (CET, UTC+1).
 * La oferta está abierta mientras ahora < este instante.
 */
export const CIERRE_FUNDADORES = new Date('2027-01-01T00:00:00+01:00');

/**
 * Cuánto dura abierto un pago de fundadores (y, por tanto, su reserva).
 * Stripe exige al menos 30 minutos; se deja un minuto de margen.
 */
export const DURACION_RESERVA_SEG = 31 * 60;

/** Estados de suscripción que ocupan plaza. */
export const ESTADOS_QUE_OCUPAN = new Set(['active', 'trialing', 'past_due']);

export function ofertaAbierta(ahora: Date): boolean {
  return ahora.getTime() < CIERRE_FUNDADORES.getTime();
}

export interface SesionCheckout {
  id: string;
  status?: string | null;
  url?: string | null;
  expires_at?: number | null;
  metadata?: Record<string, string> | null;
}

/** Un pago de fundadores abierto y sin caducar: su plaza está reservada. */
export function esReservaVigente(s: SesionCheckout, ahoraSeg: number): boolean {
  return (
    s.status === 'open' &&
    s.metadata?.itemKey === ITEM_KEY_FUNDADORES &&
    (s.expires_at ?? 0) > ahoraSeg
  );
}

export function calcularPlazas(p: { suscripciones: number; reservas: number; ahora: Date }) {
  const ocupadas = p.suscripciones + p.reservas;
  const restantes = Math.max(0, PLAZAS_TOTALES - ocupadas);
  return {
    total: PLAZAS_TOTALES,
    restantes,
    disponible: ofertaAbierta(p.ahora) && restantes > 0,
    cierre: CIERRE_FUNDADORES.toISOString(),
  };
}

// --------------------------------------------------------------------------
// Llamadas a Stripe. Se pagina a mano (has_more / starting_after) para que los
// tests puedan simular Stripe con objetos sencillos.
// --------------------------------------------------------------------------

type Lista<T> = { data: T[]; has_more: boolean };

async function recorrer<T extends { id: string }>(
  pedir: (desde?: string) => Promise<Lista<T>>,
  maxPaginas = 50,
): Promise<T[]> {
  const todo: T[] = [];
  let desde: string | undefined;
  for (let i = 0; i < maxPaginas; i++) {
    const pagina = await pedir(desde);
    todo.push(...pagina.data);
    if (!pagina.has_more || pagina.data.length === 0) return todo;
    desde = pagina.data[pagina.data.length - 1].id;
  }
  // Nunca devolver un recuento a medias: contaría de menos y se venderían
  // plazas de más. Mejor fallar (la web oculta la oferta y no se cobra).
  throw new Error(`Stripe devolvió más de ${maxPaginas} páginas; recuento abortado`);
}

/** El precio activo de fundadores, buscado por su lookup key. null si no existe. */
export async function precioFundadores(stripe: any): Promise<{ id: string } | null> {
  const r = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY_FUNDADORES], active: true, limit: 1 });
  return r?.data?.[0] ?? null;
}

export async function contarSuscripcionesFundadores(stripe: any, priceId: string): Promise<number> {
  const subs = await recorrer<{ id: string; status: string }>((desde) =>
    stripe.subscriptions.list({
      price: priceId,
      status: 'all',
      limit: 100,
      ...(desde ? { starting_after: desde } : {}),
    }),
  );
  return subs.filter((s) => ESTADOS_QUE_OCUPAN.has(s.status)).length;
}

/** Pagos de fundadores abiertos ahora mismo (cada uno reserva una plaza). */
export async function reservasAbiertas(stripe: any, ahora: Date): Promise<SesionCheckout[]> {
  const ahoraSeg = Math.floor(ahora.getTime() / 1000);
  // Un pago abierto tiene como mucho DURACION_RESERVA_SEG de vida: basta con
  // mirar los creados en esa ventana (más un margen).
  const desdeSeg = ahoraSeg - DURACION_RESERVA_SEG - 120;
  const sesiones = await recorrer<SesionCheckout>((desde) =>
    stripe.checkout.sessions.list({
      status: 'open',
      created: { gte: desdeSeg },
      limit: 100,
      ...(desde ? { starting_after: desde } : {}),
    }),
  );
  return sesiones.filter((s) => esReservaVigente(s, ahoraSeg));
}

/** Estado completo de la oferta, consultado en Stripe en este momento. */
export async function estadoFundadores(stripe: any, ahora: Date = new Date()) {
  const precio = await precioFundadores(stripe);
  if (!precio) {
    return { ...calcularPlazas({ suscripciones: PLAZAS_TOTALES, reservas: 0, ahora }), disponible: false, precioId: null, reservas: [] as SesionCheckout[] };
  }
  const [suscripciones, reservas] = await Promise.all([
    contarSuscripcionesFundadores(stripe, precio.id),
    reservasAbiertas(stripe, ahora),
  ]);
  return { ...calcularPlazas({ suscripciones, reservas: reservas.length, ahora }), precioId: precio.id, reservas };
}
