// Eliminar cuenta (30/09/2026). Puro: lo usan la Edge Function
// eliminar-cuenta, la página de confirmación y vitest.

/** La confirmación es escribir el email de la cuenta. Sin mayúsculas ni espacios de más. */
export const confirmacionValida = (escrito: unknown, emailDeLaCuenta: unknown): boolean => {
  const a = String(escrito ?? '').trim().toLowerCase();
  const b = String(emailDeLaCuenta ?? '').trim().toLowerCase();
  return a.length > 3 && a === b;
};

/**
 * Suscripciones de Stripe que hay que cancelar al dar de baja la cuenta: las
 * que todavía pueden cobrar. Las ya canceladas o caducadas se dejan.
 */
export const ESTADOS_QUE_COBRAN = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'] as const;
export const hayQueCancelar = (estado: string): boolean =>
  (ESTADOS_QUE_COBRAN as readonly string[]).includes(estado);

/** Cubos de almacenamiento donde cada cuenta guarda ficheros bajo su id (`<uid>/...`). */
export const CUBOS_CON_FICHEROS_DE_LA_CUENTA = ['brand-logos', 'fiscal-certificates', 'portal-files'] as const;

/** Años que se conservan las facturas y registros fiscales de una cuenta eliminada. */
export const ANOS_CONSERVACION_FISCAL = 4;
