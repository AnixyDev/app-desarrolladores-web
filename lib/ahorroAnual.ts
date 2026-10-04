// Ahorro del pago anual frente a pagar 12 meses, calculado con los precios
// del catálogo (supabase/functions/_shared/catalogo-stripe.ts).
//
// Antes el selector Mensual/Anual decía "-20%" escrito a mano, y no era
// verdad en ningún plan. Aquí se calcula, así que si cambian los precios la
// etiqueta cambia sola. Se redondea hacia abajo: nunca se anuncia más ahorro
// del real.
import { precioDe } from '../supabase/functions/_shared/catalogo-stripe';

/** "9,95€" o "1,95 €" → 9.95. null si no es un importe. */
export function aEuros(precio: string | undefined | null): number | null {
  if (!precio) return null;
  const n = Number(precio.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Porcentaje entero de ahorro del plan anual frente a 12 meses del mensual. */
export function porcentajeAhorroAnual(claveMensual: string, claveAnual: string): number | null {
  const mes = aEuros(precioDe(claveMensual)?.precio);
  const anio = aEuros(precioDe(claveAnual)?.precio);
  if (mes === null || anio === null) return null;
  const pct = Math.floor((1 - anio / (mes * 12)) * 100);
  return pct > 0 ? pct : null;
}

export const AHORRO_PRO = () => porcentajeAhorroAnual('proPlan', 'proPlanYearly');
export const AHORRO_TEAM = () => porcentajeAhorroAnual('teamsPlan', 'teamsPlanYearly');

/** Mayor ahorro entre los planes, para el selector ("Ahorra hasta 28 %"). */
export function ahorroMaximo(): number | null {
  const valores = [AHORRO_PRO(), AHORRO_TEAM()].filter((v): v is number => v !== null);
  return valores.length ? Math.max(...valores) : null;
}
