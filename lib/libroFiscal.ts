// Libro Fiscal: qué facturas cuentan y totales del trimestre o del año.
//
// Antes se excluían TODAS las facturas sin IVA ni IRPF. Así se perdían las
// facturas a clientes extranjeros (UE o fuera de la UE), que van sin IVA
// español por ley y sí son ingresos: faltaban en el CSV para la gestoría y en
// el beneficio del Modelo 130.
//
// Ahora:
// - Cuentan las facturas con IVA o IRPF y las que llevan motivo de no llevar
//   IVA (invoices.motivo_sin_iva, lo pone la base de datos según el cliente).
// - Solo quedan aparte, con aviso, las de IVA 0 e IRPF 0 SIN motivo: lo normal
//   es que sean un error (una factura a un cliente español sin IVA).
import type { Expense, Invoice, MotivoSinIva } from '@/types';

export const ETIQUETA_SIN_IVA: Record<MotivoSinIva, string> = {
  inversion_sujeto_pasivo_ue: 'Sin IVA español: inversión del sujeto pasivo (cliente UE)',
  no_sujeta_fuera_ue: 'Sin IVA español: no sujeta (cliente fuera de la UE)',
};

type FacturaLibro = Pick<Invoice, 'subtotal_cents' | 'tax_percent' | 'irpf_percent' | 'motivo_sin_iva'>;
type GastoLibro = Pick<Expense, 'amount_cents' | 'tax_percent'>;

const llevaImpuestos = (f: FacturaLibro) => (f.tax_percent || 0) > 0 || (f.irpf_percent || 0) > 0;

/** ¿Entra en el Libro Fiscal? */
export const cuentaEnLibro = (f: FacturaLibro): boolean => llevaImpuestos(f) || !!f.motivo_sin_iva;

export function clasificarFacturas<T extends FacturaLibro>(facturas: T[]): { incluidas: T[]; revisar: T[] } {
  const incluidas: T[] = [];
  const revisar: T[] = [];
  for (const f of facturas) (cuentaEnLibro(f) ? incluidas : revisar).push(f);
  return { incluidas, revisar };
}

export interface TotalesLibro {
  totalIngresos: number;
  /** Parte de los ingresos facturada sin IVA español (clientes UE / fuera de la UE). */
  baseSinIva: number;
  totalGastos: number;
  beneficio: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  ivaAPagar: number;
  totalRetenciones: number;
  irpfAPagar: number;
}

/** Importes en céntimos, igual que en la base de datos. */
export function totalesLibro(facturas: FacturaLibro[], gastos: GastoLibro[], irpfPagoFraccionado: number): TotalesLibro {
  const totalIngresos = facturas.reduce((s, f) => s + f.subtotal_cents, 0);
  const baseSinIva = facturas.filter((f) => !!f.motivo_sin_iva).reduce((s, f) => s + f.subtotal_cents, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.amount_cents, 0);
  const ivaRepercutido = facturas.reduce((s, f) => s + f.subtotal_cents * ((f.tax_percent || 0) / 100), 0);
  const ivaSoportado = gastos.reduce((s, g) => s + g.amount_cents * ((g.tax_percent || 0) / 100), 0);
  const totalRetenciones = facturas.reduce((s, f) => s + f.subtotal_cents * ((f.irpf_percent || 0) / 100), 0);
  const beneficio = totalIngresos - totalGastos;
  const cuotaIntegra = beneficio > 0 ? beneficio * (irpfPagoFraccionado / 100) : 0;
  return {
    totalIngresos,
    baseSinIva,
    totalGastos,
    beneficio,
    ivaRepercutido,
    ivaSoportado,
    ivaAPagar: ivaRepercutido - ivaSoportado,
    totalRetenciones,
    irpfAPagar: Math.max(0, cuotaIntegra - totalRetenciones),
  };
}
