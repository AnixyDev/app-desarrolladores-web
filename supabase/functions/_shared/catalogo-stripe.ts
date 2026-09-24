// Catalogo de productos de Stripe — UNICA fuente de verdad.
//
// Vivia solo en services/stripeService.ts, es decir, en el navegador, y
// create-checkout-session se limitaba a reenviar a Stripe lo que le llegara:
// el priceId, el modo, el importe (`amount` → `unit_amount`) y el metadata
// entero. Como el webhook concede el plan y los creditos mirando
// `session.metadata.itemKey` y `session.metadata.credits` — sin comprobar
// nunca cuanto se pago — cualquier usuario registrado podia pedir un checkout
// de 1 centimo con `itemKey: 'teamsPlan'` o con `credits: '1000000'` y
// quedarselo. Ademas `metadata` se esparcia DESPUES de `supabase_user_id`,
// asi que tambien podia suplantar a otro usuario.
//
// Ahora el servidor no acepta ni importe ni priceId ni modo: solo un itemKey,
// y todo lo demas sale de aqui.
//
// Este archivo no importa nada de Deno ni de la red: lo cargan tanto la Edge
// Function como el frontend (services/stripeService.ts) y vitest.

export interface ArticuloStripe {
  /** price_id real en Stripe. null = no se puede comprar por checkout. */
  priceId: string | null;
  mode: 'payment' | 'subscription';
  name: string;
  /** Creditos que concede el webhook. Solo para los paquetes de creditos. */
  credits?: number;
  /**
   * Importe tal y como se le ensena al usuario, en euros.
   *
   * Vivia escrito a mano en cada pantalla, y por eso se desincronizo: la
   * subida de agosto se aplico en PricingPage y en BillingPage, pero
   * UpgradeModal — el modal de conversion que abren OCHO paginas distintas —
   * se quedo anunciando 35,95 euros por un plan que cobra 45,95. El usuario
   * veia un precio y Stripe le cobraba otro.
   *
   * El precio de verdad lo fija Stripe con el priceId de arriba; esto es solo
   * como se muestra, pero al vivir junto al priceId ya no hay dos sitios que
   * puedan discrepar entre si.
   */
  precio?: string;
  /** 'mes' o 'ano' para las suscripciones. Vacio en los pagos unicos. */
  periodo?: 'mes' | 'año';
}

// CAMBIO (subida de precios, ago 2026): priceId de proPlan y teamsPlan
// actualizados a los nuevos importes (9,95€/mes y 45,95€/mes). Se añade
// proPlanYearly, que antes no existía. teamsPlanYearly actualizado a 395€.
// Los price_id ANTIGUOS se desactivaron en Stripe (ya no admiten checkouts
// nuevos), pero los suscriptores que ya los tenían contratados siguen
// pagando su importe de siempre — no se les ha tocado nada.
export const STRIPE_ITEMS = {
  proPlan: {
    priceId: 'price_1U0juK8oC5awQy15YPiUjnn2',
    mode: 'subscription',
    name: 'Pro Plan',
    precio: '9,95€',
    periodo: 'mes',
  },
  proPlanYearly: {
    priceId: 'price_1U0juP8oC5awQy15fzLhBWOd',
    mode: 'subscription',
    name: 'Pro Plan (Anual)',
    precio: '99,95€',
    periodo: 'año',
  },
  teamsPlan: {
    priceId: 'price_1U0juV8oC5awQy15ATm0EYe4',
    mode: 'subscription',
    name: 'Plan de equipos (Mensual)',
    precio: '45,95€',
    periodo: 'mes',
  },
  teamsPlanYearly: {
    priceId: 'price_1U0jub8oC5awQy15QXzf5Vgp',
    mode: 'subscription',
    name: 'Plan de equipos (Anual)',
    precio: '395€',
    periodo: 'año',
  },
  aiCredits100: {
    priceId: 'price_1SOgpy8oC5awQy15TW22fBot',
    mode: 'payment',
    name: '100 Créditos de IA',
    credits: 100,
    precio: '1,95 €',
  },
  aiCredits500: {
    priceId: 'price_1SOgr18oC5awQy15o1gTM2VM',
    mode: 'payment',
    name: '500 Créditos de IA',
    credits: 500,
    precio: '3,95 €',
  },
  aiCredits1000: {
    priceId: 'price_1SOguC8oC5awQy15LGchpkVG',
    mode: 'payment',
    name: '1000 Créditos de IA',
    credits: 1000,
    precio: '5,95 €',
  },
  // Ítem 5 del roadmap — paquetes de firma electrónica. Creados en Stripe
  // el 14/09, pago único (no suscripción).
  signatureCredits5: {
    priceId: 'price_1UFXFl8oC5awQy15P41Fag3Q',
    mode: 'payment',
    name: '5 Créditos de Firma',
    credits: 5,
  },
  signatureCredits10: {
    priceId: 'price_1UFXHB8oC5awQy15XZrgT22B',
    mode: 'payment',
    name: '10 Créditos de Firma',
    credits: 10,
  },
  signatureCredits25: {
    priceId: 'price_1UFXIH8oC5awQy15crrwynWT',
    mode: 'payment',
    name: '25 Créditos de Firma',
    credits: 25,
  },
  featuredJobPost: {
    priceId: 'price_1SOlOv8oC5awQy15Q2aXoEg7',
    mode: 'payment',
    name: 'Oferta de empleo destacada',
  },
  // No pasa por create-checkout-session: el pago de facturas va por
  // payment-sheet, que calcula el importe leyendo la factura. Se queda aqui
  // porque StripePaymentModal lo usa como etiqueta por defecto.
  invoicePayment: {
    priceId: null,
    mode: 'payment',
    name: 'Pago de Factura',
  },
} as const satisfies Record<string, ArticuloStripe>;

export type StripeItemKey = keyof typeof STRIPE_ITEMS;

// Acceso por clave PROPIA. Con corchetes a secas, una clave heredada del
// prototipo ('constructor', 'toString', 'hasOwnProperty') devuelve una funcion
// en vez de nada, y esComprablePorCheckout('constructor') daba true porque
// `funcion.priceId !== null` se cumple. Lo cazo un test.
const PROPIA = Object.prototype.hasOwnProperty;

export function articulo(clave: string): ArticuloStripe | null {
  if (typeof clave !== 'string' || !PROPIA.call(STRIPE_ITEMS, clave)) return null;
  return (STRIPE_ITEMS as Record<string, ArticuloStripe>)[clave];
}

/** Los unicos itemKey que create-checkout-session acepta. */
export function esComprablePorCheckout(clave: string): clave is StripeItemKey {
  const item = articulo(clave);
  return item !== null && typeof item.priceId === 'string' && item.priceId.length > 0;
}

/**
 * El precio de un articulo tal y como se muestra, o null si no tiene.
 *
 * Nunca devuelve un precio inventado: si falta, quien lo pinte debe decidir
 * que ensena, y no dar por bueno un numero escrito a mano.
 */
export function precioDe(clave: string): { precio: string; periodo?: 'mes' | 'año' } | null {
  const item = articulo(clave);
  if (!item || typeof item.precio !== 'string' || item.precio.length === 0) return null;
  return { precio: item.precio, periodo: item.periodo };
}
