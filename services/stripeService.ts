//services/stripeService.ts

import { supabase, getURL } from '@/lib/supabaseClient';
import { loadStripe, Stripe } from '@stripe/stripe-js';

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

// Soporte dual Vite / Next-style
const STRIPE_PUBLIC_KEY =
  getEnv('VITE_STRIPE_PUBLIC_KEY') ||
  getEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');

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
          '%c⚠️ ALERTA CRÍTICA: Se está utilizando una clave de PRUEBAS en PRODUCCIÓN. Los pagos reales no funcionarán.',
          'color: white; background: red; font-size: 16px; font-weight: bold; padding: 8px;'
        );
      } else {
        console.info('Stripe cargado en modo TEST.');
      }
    } else if (STRIPE_PUBLIC_KEY.startsWith('pk_live')) {
      console.info('Stripe cargado en modo PRODUCCIÓN (LIVE).');
    }

    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }

  return stripePromise;
};

/* -------------------------
   Catálogo de productos CORREGIDO
-------------------------- */

export const STRIPE_ITEMS = {
  proPlan: {
    priceId: 'price_1SOgUF8oC5awQy15dOEM5jGS',
    mode: 'subscription' as const,
    name: 'Pro Plan',
  },
  // Plan Mensual: 35,95€
  teamsPlan: {
    priceId: 'price_1SOggV8oC5awQy15YW1wAgcg',
    mode: 'subscription' as const,
    name: 'Plan de equipos (Mensual)',
  },
  // Plan Anual: 295€ (Cuota un año)
  teamsPlanYearly: {
    priceId: 'price_1SOggV8oC5awQy15Ppz7bUj0', 
    mode: 'payment' as const, // <--- CAMBIA 'subscription' por 'payment'
    name: 'Plan de equipos (Anual)',
  },
  aiCredits100: {
    priceId: 'price_1SOgpy8oC5awQy15TW22fBot',
    mode: 'payment' as const,
    name: '100 Créditos de IA',
    credits: 100,
  },
  aiCredits500: {
    priceId: 'price_1SOgr18oC5awQy15o1gTM2VM',
    mode: 'payment' as const,
    name: '500 Créditos de IA',
    credits: 500,
  },
  aiCredits1000: {
    priceId: 'price_1SOguC8oC5awQy15LGchpkVG',
    mode: 'payment' as const,
    name: '1000 Créditos de IA',
    credits: 1000,
  },
  featuredJobPost: {
    priceId: 'price_1SOlOv8oC5awQy15Q2aXoEg7',
    mode: 'payment' as const,
    name: 'Oferta de empleo destacada',
  },
  invoicePayment: {
    priceId: null,
    mode: 'payment' as const,
    name: 'Pago de Factura',
  },
};;

export type StripeItemKey = keyof typeof STRIPE_ITEMS;

/* -------------------------
   Checkout
-------------------------- */

export const redirectToCheckout = async (
  itemKey: StripeItemKey,
  extraParams: Record<string, any> = {}
) => {
  const item = STRIPE_ITEMS[itemKey];
  if (!item) throw new Error('El artículo de compra no es válido.');

  const currentUrl = getURL();

  const bodyPayload = {
    priceId: item.priceId || undefined,
    mode: item.mode,
    amount:
      itemKey === 'invoicePayment'
        ? extraParams.amount_cents
        : undefined,
    productName:
      itemKey === 'invoicePayment'
        ? `Factura ${extraParams.invoice_number}`
        : undefined,
    metadata: {
      ...extraParams,
      itemKey,
      origin: currentUrl,
    },
  };

  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    {
      body: bodyPayload,
    }
  );

  if (error) {
    console.error('Supabase Function Invoke Error:', error);
    throw new Error('No se pudo iniciar la sesión de pago segura.');
  }

  if (data?.url) {
    window.location.assign(data.url);
  } else {
    throw new Error('La pasarela de pago no devolvió una URL válida.');
  }
};

/* -------------------------
   Payment sheet
-------------------------- */

export const createPaymentIntent = async (
  amountCents: number,
  userId: string,
  itemKey: string,
  metadata: Record<string, any> = {}
) => {
  if (!userId) throw new Error('Sesión de usuario requerida.');

  const { data, error } = await supabase.functions.invoke(
    'payment-sheet',
    {
      body: {
        amount: Math.round(amountCents),
        description: `Pago ${itemKey}`,
        metadata: { ...metadata, userId, itemKey },
      },
    }
  );

  if (error)
    throw new Error(
      error.message || 'Error al procesar el intento de pago.'
    );

  return data.paymentIntentClientSecret;
};

/* -------------------------
   Customer portal
-------------------------- */

export const redirectToCustomerPortal = async () => {
  const currentUrl = getURL();

  const { data, error } = await supabase.functions.invoke(
    'create-portal-session',
    {
      body: { return_url: `${currentUrl}billing` },
    }
  );

  if (error)
    throw new Error('Error al abrir el portal de facturación.');

  if (data?.url) {
    window.location.assign(data.url);
  }
};
