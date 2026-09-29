// Cuota de autónomo (29/09/2026): cálculos puros. La usan la pantalla de
// gastos, la previsión y vitest. El histórico vive en `cuotas_autonomo`
// (cada fila: «desde este mes pago X»); los cargos ya ocurridos se apuntan
// como gastos en el servidor (ver la migración cuota_autonomo).

export interface TramoCuota { desde: string; importe_cents: number }

const aFecha = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Primer día del mes de una fecha AAAA-MM-DD. */
export const primeroDeMes = (s: string) => `${s.slice(0, 7)}-01`;

/** Último día hábil (lunes a viernes) del mes. Misma regla que la función SQL. */
export function ultimoDiaHabil(mes: string): string {
  const [a, m] = mes.slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

/** Importe vigente en un mes según el histórico (0 si aún no hay cuota o es una baja). */
export function importeDelMes(tramos: TramoCuota[], mes: string): number {
  const m = primeroDeMes(mes);
  let vigente: TramoCuota | null = null;
  for (const t of tramos) {
    if (t.desde.slice(0, 10) <= m && (!vigente || t.desde > vigente.desde)) vigente = t;
  }
  return vigente ? Number(vigente.importe_cents) || 0 : 0;
}

/** Próximo cargo a partir de hoy (incluido), o null si no hay cuota activa en 24 meses. */
export function proximoCargo(tramos: TramoCuota[], hoy: string): { fecha: string; importe_cents: number } | null {
  if (!tramos.length) return null;
  const base = aFecha(primeroDeMes(hoy));
  for (let i = 0; i < 24; i++) {
    const mes = iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1)));
    const fecha = ultimoDiaHabil(mes);
    const importe = importeDelMes(tramos, mes);
    if (fecha >= hoy && importe > 0) return { fecha, importe_cents: importe };
  }
  return null;
}

/** Cargos futuros (desde hoy, incluido) hasta `hasta`, según el histórico. */
export function cargosFuturos(tramos: TramoCuota[], hoy: string, hasta: string): { mes: string; fecha: string; importe_cents: number }[] {
  const out: { mes: string; fecha: string; importe_cents: number }[] = [];
  if (!tramos.length) return out;
  const base = aFecha(primeroDeMes(hoy));
  for (let i = 0; i < 36; i++) {
    const mes = iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1)));
    const fecha = ultimoDiaHabil(mes);
    if (fecha > hasta) break;
    const importe = importeDelMes(tramos, mes);
    if (fecha >= hoy && importe > 0) out.push({ mes, fecha, importe_cents: importe });
  }
  return out;
}

/** Suma de los gastos de cuota apuntados en un año. */
export function pagadoEnElAnio(gastos: { amount_cents: number; date: string; cuota_autonomo_mes?: string | null }[], anio: string): number {
  return gastos
    .filter(g => g.cuota_autonomo_mes && g.date.startsWith(anio))
    .reduce((s, g) => s + (Number(g.amount_cents) || 0), 0);
}
