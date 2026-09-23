import { supabase } from '@/lib/supabaseClient'; // Quita el getURL de aquí
import { loadStripe, Stripe } from '@stripe/stripe-js';

// Define getURL aquí mismo para evitar el error de importación
const getURL = () => {
  return window.location.origin;
};
/* -------------------------
   Helpers de entorno
-------------------------- */

const getEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key] || '';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
};

const STRIPE_PUBLIC_KEY =
  getEnv('VITE_STRIPE_PUBLISHABLE_KEY') ||   // ← nombre correcto, coincide con el que vas a poner en Vercel
  getEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'); // fallback por si el redeploy aún no propagó

/* -------------------------
   Stripe loader (singleton)
-------------------------- */

let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!STRIPE_PUBLIC_KEY) {
    console.error(
      'Error: No se ha configurado la clave pública de Stripe (VITE_STRIPE_PUBLIC_KEY).'
    );
    return Promise.resolve(null);
  }

  if (!stripePromise) {
    const isProduction =
      window.location.hostname !== 'localhost' &&
      !window.location.hostname.includes('127.0.0.1');

    if (STRIPE_PUBLIC_KEY.startsWith('pk_test')) {
      if (isProduction) {
        console.error(
          '%c⚠️ ALERTA CRÍTICA: Se está utilizando una clave de PRUEBAS en PRODUCCIÓN.',
          'color: white; background: red; font-size: 16px; font-weight: bold; padding: 8px;'
        );
      }
    }
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }

  return stripePromise;
};

/* -------------------------
   Catálogo de productos
-------------------------- */

// El catálogo vive en supabase/functions/_shared/catalogo-stripe.ts para que
// el servidor y el navegador usen exactamente el mismo, sin posibilidad de que
// se separen. Se reexporta aquí para no romper los imports existentes.
export { STRIPE_ITEMS } from '../supabase/functions/_shared/catalogo-stripe';
export type { StripeItemKey } from '../supabase/functions/_shared/catalogo-stripe';
import { STRIPE_ITEMS, type StripeItemKey } from '../supabase/functions/_shared/catalogo-stripe';

/* -------------------------
   Checkout (CORREGIDO)
-------------------------- */

export const redirectToCheckout = async (
  itemKey: StripeItemKey,
  extraParams: Record<string, any> = {}
) => {
  const item = STRIPE_ITEMS[itemKey];
  if (!item) throw new Error('El artículo de compra no es válido.');

  // Obtener sesión con manejo de errores
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Sesión expirada.');

  // CAMBIO: antes aquí se mandaban priceId, mode, amount y el metadata entero,
  // y el servidor los reenviaba a Stripe tal cual. Eso permitía pedir un
  // checkout de 1 céntimo con el itemKey de un plan de pago, porque el webhook
  // concede el plan y los créditos mirando el metadata, no el importe.
  //
  // Ahora el servidor tiene su propio catálogo (supabase/functions/_shared/
  // catalogo-stripe.ts, el mismo que importa este archivo) y resuelve precio,
  // modo, créditos y usuario por su cuenta. Aquí solo va el itemKey y las
  // referencias que no afectan al precio.
  const bodyPayload = {
    itemKey,
    ...(extraParams.job_id ? { job_id: extraParams.job_id } : {}),
    ...(extraParams.client_reference_id
      ? { client_reference_id: extraParams.client_reference_id }
      : {}),
  };

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: bodyPayload,
    // El cliente de supabase ya inyecta el Auth header automáticamente si está configurado,
    // pero si falla, puedes añadirlo aquí:
    headers: { 
      'Authorization': `Bearer ${session.access_token}` 
    }
  });

  if (error) throw new Error('Error al conectar con el servicio de pago.');
  if (!data?.url) throw new Error('URL de sesión no generada.');

  window.location.href = data.url;
};
/* -------------------------
   Payment sheet
-------------------------- */

export const createPaymentIntent = async (
  amountCents: number,
  userId: string | null,
  itemKey: string,
  metadata: Record<string, any> = {}
) => {
  // NUEVO: userId ya no es obligatorio. Un cliente que paga desde la
  // página pública de factura (/pay/:invoiceId) no tiene sesión de
  // DevFreelancer — ni falta que le hace, esta app es de los freelancers,
  // no de sus clientes. payment-sheet ya resuelve todo lo necesario
  // (comisión de Stripe Connect, etc.) a partir de metadata.invoice_id,
  // sin depender de quién esté logueado.
  const { data, error } = await supabase.functions.invoke(
    'payment-sheet',
    {
      body: {
        amount: Math.round(amountCents),
        description: `Pago ${itemKey}`,
        metadata: { ...metadata, ...(userId ? { userId } : {}), itemKey },
      },
      headers: { 'Content-Type': 'application/json' }
    }
  );

  if (error) {
    // FIX: 'error.message' del SDK de Supabase para Edge Functions es
    // genérico ("Edge Function returned a non-2xx status code") y no dice
    // nada del motivo real — el cuerpo JSON de verdad (con el mensaje que
    // sí escribimos en payment-sheet) viene en error.context, y había que
    // leerlo explícitamente para verlo.
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch {
      // El cuerpo no era JSON legible — nos quedamos con el mensaje genérico.
    }
    throw new Error(detail || 'Error al procesar el intento de pago.');
  }

  return data.paymentIntentClientSecret;
};

/* -------------------------
   Customer portal
-------------------------- */

export const redirectToCustomerPortal = async () => {
  const currentUrl = getURL().replace(/\/$/, "");

  const { data, error } = await supabase.functions.invoke(
    'create-portal-session',
    {
      body: { return_url: `${currentUrl}/billing` },
      headers: { 'Content-Type': 'application/json' }
    }
  );

  if (error) throw new Error('Error al abrir el portal de facturación.');

  if (data?.url) {
    window.location.href = data.url;
  }
};
