// Lectura de facturas de Stripe que no depende de la version de la API.
//
// Los eventos del webhook llegan con la version de API configurada en el
// ENDPOINT de Stripe (hoy 2025-09-30.clover), no con la del SDK. Desde basil
// (2025-03-31) la factura ya no trae invoice.subscription: el dato esta en
// invoice.parent.subscription_details.subscription.
// https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects
//
// Este archivo no importa nada de Deno ni de la red: lo cargan la Edge
// Function y vitest.

/** Id de la suscripcion que genero la factura, en cualquiera de las dos formas; null si no hay. */
export function suscripcionDeLaFactura(invoice: any): string | null {
  const nueva = invoice?.parent?.type === 'subscription_details'
    ? invoice.parent.subscription_details?.subscription
    : null
  const valor = nueva ?? invoice?.subscription ?? null
  if (!valor) return null
  return typeof valor === 'string' ? valor : (valor.id ?? null)
}

/**
 * price_id de la primera línea de la factura, en las dos formas de la API:
 * clover (line.pricing.price_details.price) y la antigua (line.price.id).
 * Sirve para saber si una factura es del plan Pro o del de equipos.
 */
export function precioDeLaFactura(invoice: any): string | null {
  const linea = invoice?.lines?.data?.[0]
  if (!linea) return null
  const nueva = linea?.pricing?.price_details?.price
  const valor = nueva ?? linea?.price ?? null
  if (!valor) return null
  return typeof valor === 'string' ? valor : (valor.id ?? null)
}
