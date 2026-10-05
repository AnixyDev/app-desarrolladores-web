// Cancelar la suscripción eligiendo cuándo (04/10/2026).
//
// Sin imports de Deno ni de Stripe para que vitest lo pruebe
// (src/test/cancelacion.test.ts). La función cancelar-suscripcion hace las
// llamadas a Stripe con lo que decide este módulo.
//
// - 'al_final': la suscripción sigue hasta el final del periodo pagado y no se
//   renueva (cancel_at_period_end = true). Se puede reanudar hasta ese día.
// - 'ahora': se cancela en el momento, sin devolver la parte no usada (lo dicen
//   los Términos, salvo el desistimiento de consumidores, que se pide aparte).
//   La cuenta pasa al plan gratuito; no se borra ningún dato.
// - 'reanudar': deshace una cancelación programada para el final del periodo.
// Copia de LOOKUP_KEY_FUNDADORES (fundadores.ts): importarlo con «.ts» rompe
// tsc del frontend. src/test/cancelacion.test.tsx comprueba que coinciden.
export const LOOKUP_KEY_FUNDADORES = 'pro_anual_fundadores';

export type AccionCancelacion = 'estado' | 'al_final' | 'ahora' | 'reanudar';
export const ACCIONES: AccionCancelacion[] = ['estado', 'al_final', 'ahora', 'reanudar'];

/** Lo que se usa de una suscripción de Stripe (API 2023-10-16). */
export interface SuscripcionStripe {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number; // segundos
  items: { data: Array<{ price: { lookup_key?: string | null; recurring?: { interval?: string } | null } }> };
}

// Suscripciones que el usuario puede cancelar: las que dan acceso o están
// pendientes de cobro.
const VIVAS = new Set(['active', 'trialing', 'past_due', 'unpaid']);

export const suscripcionesVivas = (subs: SuscripcionStripe[]) => subs.filter((s) => VIVAS.has(s.status));

export interface EstadoSuscripcion {
  tieneSuscripcion: boolean;
  cancelacionProgramada: boolean;
  /** Fin del periodo pagado (ISO). */
  finPeriodo: string | null;
  esFundadores: boolean;
  intervalo: 'month' | 'year' | null;
}

export function estadoSuscripcion(subs: SuscripcionStripe[]): EstadoSuscripcion {
  const vivas = suscripcionesVivas(subs);
  if (vivas.length === 0) {
    return { tieneSuscripcion: false, cancelacionProgramada: false, finPeriodo: null, esFundadores: false, intervalo: null };
  }
  const precios = vivas.flatMap((s) => s.items.data.map((i) => i.price));
  const intervalo = precios.find((p) => p.recurring?.interval)?.recurring?.interval;
  return {
    tieneSuscripcion: true,
    cancelacionProgramada: vivas.every((s) => s.cancel_at_period_end),
    finPeriodo: new Date(Math.max(...vivas.map((s) => s.current_period_end)) * 1000).toISOString(),
    esFundadores: precios.some((p) => p.lookup_key === LOOKUP_KEY_FUNDADORES),
    intervalo: intervalo === 'month' || intervalo === 'year' ? intervalo : null,
  };
}

export type OperacionStripe =
  | { tipo: 'actualizar'; id: string; cancel_at_period_end: boolean }
  | { tipo: 'cancelar'; id: string };

/** Qué hay que pedir a Stripe para cada acción. */
export function operacionesPara(accion: AccionCancelacion, subs: SuscripcionStripe[]): OperacionStripe[] {
  const vivas = suscripcionesVivas(subs);
  switch (accion) {
    case 'al_final':
      return vivas.filter((s) => !s.cancel_at_period_end).map((s) => ({ tipo: 'actualizar', id: s.id, cancel_at_period_end: true }));
    case 'reanudar':
      return vivas.filter((s) => s.cancel_at_period_end).map((s) => ({ tipo: 'actualizar', id: s.id, cancel_at_period_end: false }));
    case 'ahora':
      return vivas.map((s) => ({ tipo: 'cancelar', id: s.id }));
    default:
      return [];
  }
}
