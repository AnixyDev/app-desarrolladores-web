// Previsión de tesorería (29/09/2026). Pura: la usa pages/ForecastingPage y
// la prueba vitest.
//
// La página «Previsión» era una copia antigua de la de facturas. Esto calcula,
// mes a mes, qué dinero va a ENTRAR y SALIR con lo que la app ya sabe:
//   - facturas pendientes de cobro (lo que falta por cobrar, en su vencimiento;
//     las vencidas, en el mes en curso),
//   - facturas recurrentes (se emiten en su fecha y se cobran a 30 días, que es
//     el vencimiento que les pone process-recurring-invoices),
//   - presupuestos aceptados que aún no tienen factura (opcional),
//   - gastos recurrentes, gastos variables (media de los 3 meses anteriores),
//   - el IVA trimestral a ingresar (modelo 303), estimado.
// No es contabilidad: es una estimación para ver con tiempo un mes flojo.

import type { Invoice, RecurringInvoice, RecurringExpense, Expense, InvoiceItem } from '@/types';
import { siguienteFecha } from '../supabase/functions/process-recurring-invoices/fechas';

export type TipoMovimiento = 'factura' | 'vencida' | 'recurrente' | 'presupuesto' | 'gasto-recurrente' | 'gastos-variables' | 'iva';

export interface MovimientoPrevisto {
  fecha: string; // AAAA-MM-DD
  mes: string; // AAAA-MM
  tipo: TipoMovimiento;
  concepto: string;
  /** Positivo = entra dinero; negativo = sale. */
  importeCents: number;
}

export interface MesPrevision {
  mes: string; // AAAA-MM
  etiqueta: string; // «oct 2026»
  cobros: number;
  pagos: number; // en positivo
  neto: number;
  saldo: number;
  porTipo: Record<TipoMovimiento, number>;
}

export interface ResultadoPrevision {
  meses: MesPrevision[];
  movimientos: MovimientoPrevisto[];
  vencidas: { cantidad: number; totalCents: number };
  mediaGastosVariablesCents: number;
  totalCobros: number;
  totalPagos: number;
  mesesEnNegativo: string[];
  saldoMinimo: { mes: string; saldo: number } | null;
}

export type FacturaPrevision = Pick<Invoice, 'id' | 'invoice_number' | 'client_id' | 'issue_date' | 'due_date' | 'subtotal_cents' | 'tax_percent' | 'total_cents' | 'paid'>;
export type RecurrentePrevision = Pick<RecurringInvoice, 'id' | 'client_id' | 'items' | 'tax_percent' | 'frequency' | 'start_date' | 'next_due_date'>;
export type GastoRecurrentePrevision = Pick<RecurringExpense, 'id' | 'amount_cents' | 'frequency' | 'start_date' | 'next_date' | 'description'>;
export type GastoPrevision = Pick<Expense, 'amount_cents' | 'date' | 'tax_percent'>;

export interface EntradaPrevision {
  hoy: string; // AAAA-MM-DD
  meses: number; // incluido el mes en curso
  facturas: FacturaPrevision[];
  cobradoPorFactura: Record<string, number>;
  recurrentes: RecurrentePrevision[];
  gastosRecurrentes: GastoRecurrentePrevision[];
  gastos: GastoPrevision[];
  presupuestosSinFacturar: { id: string; amount_cents: number; description?: string }[];
  incluirPresupuestos: boolean;
  saldoInicialCents: number;
  nombreCliente?: (id: string) => string;
}

const TIPOS: TipoMovimiento[] = ['factura', 'vencida', 'recurrente', 'presupuesto', 'gasto-recurrente', 'gastos-variables', 'iva'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_MS = 86_400_000;

const aFecha = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (s: string, dias: number) => iso(new Date(aFecha(s).getTime() + dias * DIA_MS));
const mesDe = (s: string) => s.slice(0, 7);

/** Claves AAAA-MM de los `n` meses a partir del de `hoy`. */
export function mesesDesde(hoy: string, n: number): string[] {
  const d = aFecha(hoy);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    out.push(iso(m).slice(0, 7));
  }
  return out;
}

export const etiquetaMes = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

const ultimoDiaDelMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return iso(new Date(Date.UTC(a, m, 0)));
};

export const subtotalDeLineas = (items: InvoiceItem[] | null | undefined) =>
  Math.round((items ?? []).reduce((s, it) => s + (Number(it.price_cents) || 0) * (Number(it.quantity) || 0), 0));

/** Trimestre (1-4) y año de una fecha. */
const trimestreDe = (s: string) => ({ anio: Number(s.slice(0, 4)), t: Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1 });

/**
 * Fecha límite del modelo 303 de cada trimestre: día 20 del mes siguiente,
 * salvo el 4T, que se presenta hasta el 30 de enero.
 */
export function plazoDel303(anio: number, t: number): string {
  if (t === 4) return `${anio + 1}-01-30`;
  return `${anio}-${String(t * 3 + 1).padStart(2, '0')}-20`;
}

/** Fechas de un recurrente desde `desde` hasta `hasta`, ambas incluidas. */
function fechasRecurrentes(primera: string, frecuencia: string, anclaje: string, desde: string, hasta: string): string[] {
  const out: string[] = [];
  let actual: string | null = primera?.slice(0, 10) || null;
  let guardia = 0;
  while (actual && actual <= hasta && guardia++ < 400) {
    if (actual >= desde) out.push(actual);
    actual = siguienteFecha(actual, frecuencia, anclaje?.slice(0, 10) || actual);
  }
  return out;
}

export function calcularPrevision(e: EntradaPrevision): ResultadoPrevision {
  const meses = mesesDesde(e.hoy, Math.max(1, Math.min(12, e.meses)));
  const fin = ultimoDiaDelMes(meses[meses.length - 1]);
  const cliente = (id: string) => e.nombreCliente?.(id) || 'Cliente';
  const movimientos: MovimientoPrevisto[] = [];
  const empuja = (fecha: string, tipo: TipoMovimiento, concepto: string, importeCents: number) => {
    if (!importeCents) return;
    movimientos.push({ fecha, mes: mesDe(fecha), tipo, concepto, importeCents: Math.round(importeCents) });
  };

  // 1) Facturas pendientes de cobro.
  let vencidasCantidad = 0;
  let vencidasTotal = 0;
  for (const f of e.facturas) {
    if (f.paid) continue;
    const pendiente = (Number(f.total_cents) || 0) - (e.cobradoPorFactura[f.id] ?? 0);
    if (pendiente === 0) continue;
    const vence = (f.due_date || f.issue_date || e.hoy).slice(0, 10);
    if (vence < e.hoy) {
      vencidasCantidad++;
      vencidasTotal += pendiente;
      empuja(e.hoy, 'vencida', `${f.invoice_number} · ${cliente(f.client_id)} (vencida el ${vence})`, pendiente);
    } else if (vence <= fin) {
      empuja(vence, 'factura', `${f.invoice_number} · ${cliente(f.client_id)}`, pendiente);
    }
  }

  // 2) Facturas recurrentes: emisión en su fecha, cobro a 30 días.
  const emisionesRecurrentes: { fecha: string; subtotal: number; tax: number }[] = [];
  for (const r of e.recurrentes) {
    const subtotal = subtotalDeLineas(r.items);
    const tax = Number(r.tax_percent ?? 0);
    const total = Math.round(subtotal + subtotal * (tax / 100));
    for (const emision of fechasRecurrentes(r.next_due_date, r.frequency, r.start_date, e.hoy, fin)) {
      emisionesRecurrentes.push({ fecha: emision, subtotal, tax });
      const cobro = sumarDias(emision, 30);
      if (cobro <= fin) empuja(cobro, 'recurrente', `Recurrente · ${cliente(r.client_id)} (emitida el ${emision})`, total);
    }
  }

  // 3) Presupuestos aceptados sin factura: a mitad del mes siguiente.
  if (e.incluirPresupuestos && meses.length > 1) {
    const fecha = `${meses[1]}-15`;
    for (const p of e.presupuestosSinFacturar) {
      empuja(fecha, 'presupuesto', `Presupuesto aceptado${p.description ? ` · ${p.description.slice(0, 60)}` : ''}`, Number(p.amount_cents) || 0);
    }
  }

  // 4) Gastos recurrentes. Su «próxima fecha» no la avanza ninguna tarea, así
  //    que las pasadas se dan por pagadas y se empieza en la primera futura.
  for (const g of e.gastosRecurrentes) {
    for (const f of fechasRecurrentes(g.next_date || g.start_date, g.frequency, g.start_date, e.hoy, fin)) {
      empuja(f, 'gasto-recurrente', g.description || 'Gasto recurrente', -(Number(g.amount_cents) || 0));
    }
  }

  // 5) Gastos variables: media de los 3 meses completos anteriores.
  const anteriores = mesesDesde(sumarDias(`${mesDe(e.hoy)}-01`, -85), 3); // los 3 meses previos
  const sumaAnteriores = e.gastos
    .filter(g => anteriores.includes(mesDe(g.date)))
    .reduce((s, g) => s + (Number(g.amount_cents) || 0), 0);
  const media = Math.round(sumaAnteriores / 3);
  if (media > 0) {
    meses.forEach((mes, i) => {
      let importe = media;
      if (i === 0) {
        // Mes en curso: solo la parte que queda.
        const diasMes = Number(ultimoDiaDelMes(mes).slice(8, 10));
        const quedan = diasMes - Number(e.hoy.slice(8, 10)) + 1;
        importe = Math.round((media * quedan) / diasMes);
      }
      empuja(i === 0 ? e.hoy : `${mes}-15`, 'gastos-variables', 'Gastos variables (media de los 3 meses anteriores)', -importe);
    });
  }

  // 6) IVA trimestral (modelo 303) con plazo dentro del horizonte.
  const trimestres = new Set<string>();
  for (let d = e.hoy; d <= sumarDias(fin, 0); d = sumarDias(d, 28)) {
    const { anio, t } = trimestreDe(d);
    const previo = t === 1 ? { anio: anio - 1, t: 4 } : { anio, t: t - 1 };
    trimestres.add(`${previo.anio}-${previo.t}`);
    trimestres.add(`${anio}-${t}`);
  }
  for (const clave of trimestres) {
    const [anio, t] = clave.split('-').map(Number);
    const plazo = plazoDel303(anio, t);
    if (plazo < e.hoy || plazo > fin) continue;
    const enTrimestre = (s: string) => {
      const q = trimestreDe(s);
      return q.anio === anio && q.t === t;
    };
    const repercutido =
      e.facturas.filter(f => enTrimestre(f.issue_date)).reduce((s, f) => s + (Number(f.subtotal_cents) || 0) * ((Number(f.tax_percent) || 0) / 100), 0) +
      emisionesRecurrentes.filter(r => enTrimestre(r.fecha)).reduce((s, r) => s + r.subtotal * (r.tax / 100), 0);
    const soportado = e.gastos.filter(g => enTrimestre(g.date)).reduce((s, g) => s + (Number(g.amount_cents) || 0) * ((Number(g.tax_percent) || 0) / 100), 0);
    const aIngresar = Math.round(repercutido - soportado);
    if (aIngresar > 0) empuja(plazo, 'iva', `IVA del ${t}T ${anio} (modelo 303, estimado)`, -aIngresar);
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.importeCents - a.importeCents);

  let saldo = e.saldoInicialCents || 0;
  const filas: MesPrevision[] = meses.map(mes => {
    const delMes = movimientos.filter(m => m.mes === mes);
    const porTipo = Object.fromEntries(TIPOS.map(t => [t, 0])) as Record<TipoMovimiento, number>;
    for (const m of delMes) porTipo[m.tipo] += m.importeCents;
    const cobros = delMes.filter(m => m.importeCents > 0).reduce((s, m) => s + m.importeCents, 0);
    const pagos = -delMes.filter(m => m.importeCents < 0).reduce((s, m) => s + m.importeCents, 0);
    const neto = cobros - pagos;
    saldo += neto;
    return { mes, etiqueta: etiquetaMes(mes), cobros, pagos, neto, saldo, porTipo };
  });

  const saldoMinimo = filas.length ? filas.reduce((a, b) => (b.saldo < a.saldo ? b : a)) : null;
  return {
    meses: filas,
    movimientos,
    vencidas: { cantidad: vencidasCantidad, totalCents: vencidasTotal },
    mediaGastosVariablesCents: media,
    totalCobros: filas.reduce((s, f) => s + f.cobros, 0),
    totalPagos: filas.reduce((s, f) => s + f.pagos, 0),
    mesesEnNegativo: filas.filter(f => f.saldo < 0).map(f => f.etiqueta),
    saldoMinimo: saldoMinimo ? { mes: saldoMinimo.etiqueta, saldo: saldoMinimo.saldo } : null,
  };
}
