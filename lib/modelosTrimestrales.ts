// Borradores de los modelos trimestrales (303 de IVA y 130 de IRPF) y la
// cifra «cuánto apartar para Hacienda».
//
// Todo en céntimos, igual que la base de datos. Las fechas se leen como texto
// AAAA-MM-DD (sin pasar por Date) para que la zona horaria no mueva una
// factura del 31/03 al trimestre siguiente.
//
// Fuentes (comprobadas el 14/10/2026):
// - Modelo 130: instrucciones de la AEAT. Casillas 01-07 ACUMULADAS desde el
//   1 de enero; 04 = 20 % de 03; 05 = casillas 07 positivas de trimestres
//   anteriores; 13 = minoración por rendimientos del año anterior ≤ 12.000 €;
//   15 = resultados negativos (casilla 19) de trimestres anteriores.
//   No hay que presentarlo si ≥ 70 % de los ingresos del año anterior
//   llevaron retención (en inicio de actividad, los del primer trimestre).
// - Gastos de difícil justificación (estimación directa simplificada): 5 % del
//   rendimiento neto previo, máximo 2.000 € al año. Van dentro de la casilla 02.
// - Modelo 303 (diseño vigente): 01-03 al 4 %, 04-06 al 10 %, 07-09 al 21 %,
//   27 cuota devengada, 28-29 IVA soportado corriente, 45 total a deducir,
//   46 resultado, 59 servicios a empresas de la UE, 120 no sujetas por reglas
//   de localización (clientes fuera de la UE), 78 cuotas a compensar de
//   periodos anteriores, 71 resultado de la liquidación.
import type { Expense, Invoice } from '@/types';
import { cuentaEnLibro } from '@/lib/libroFiscal';

export type Trimestre = 1 | 2 | 3 | 4;
export type FacturaModelo = Pick<Invoice, 'issue_date' | 'subtotal_cents' | 'tax_percent' | 'irpf_percent' | 'motivo_sin_iva'>;
export type GastoModelo = Pick<Expense, 'date' | 'amount_cents' | 'tax_percent'>;

export const TIPO_PAGO_FRACCIONADO = 20;
export const DIFICIL_JUSTIFICACION_PORCENTAJE = 5;
export const DIFICIL_JUSTIFICACION_MAXIMO_CENTS = 200_000;

// ── Fechas ────────────────────────────────────────────────────────────────

const anioDe = (fecha: string) => Number(fecha.slice(0, 4));
const trimestreDe = (fecha: string): Trimestre => (Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1) as Trimestre;

/** ¿La fecha cae en ese trimestre (o, con hastaTrimestre, entre el 1 de enero y el final de ese trimestre)? */
const enPeriodo = (fecha: string, anio: number, t: Trimestre, acumulado: boolean) =>
  anioDe(fecha) === anio && (acumulado ? trimestreDe(fecha) <= t : trimestreDe(fecha) === t);

const aTexto = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Si el último día cae en sábado o domingo, el plazo pasa al lunes. (Los festivos no se tienen en cuenta.) */
const siguienteHabil = (anio: number, mes: number, dia: number): string => {
  const d = new Date(anio, mes - 1, dia);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return aTexto(d);
};

export interface Plazo {
  /** Primer día para presentar (AAAA-MM-DD). */
  desde: string;
  /** Último día para presentar. */
  hasta: string;
  /** Último día para presentar domiciliando el pago. */
  domiciliarHasta: string;
}

/** Plazo de presentación del 303 y el 130 de un trimestre. */
export function plazoTrimestre(anio: number, t: Trimestre): Plazo {
  if (t === 4) {
    return { desde: `${anio + 1}-01-01`, hasta: siguienteHabil(anio + 1, 1, 30), domiciliarHasta: siguienteHabil(anio + 1, 1, 25) };
  }
  const mes = t * 3 + 1; // abril, julio, octubre
  const mm = String(mes).padStart(2, '0');
  return { desde: `${anio}-${mm}-01`, hasta: siguienteHabil(anio, mes, 20), domiciliarHasta: siguienteHabil(anio, mes, 15) };
}

/** El trimestre en curso para una fecha AAAA-MM-DD. */
export const trimestreActual = (hoy: string): { anio: number; t: Trimestre } => ({ anio: anioDe(hoy), t: trimestreDe(hoy) });

/** El trimestre anterior al dado. */
export const trimestreAnterior = (anio: number, t: Trimestre): { anio: number; t: Trimestre } =>
  t === 1 ? { anio: anio - 1, t: 4 } : { anio, t: (t - 1) as Trimestre };

// ── Ayudas ────────────────────────────────────────────────────────────────

const cuota = (base: number, tipo: number | null | undefined) => Math.round(base * ((tipo || 0) / 100));

/** NIF de persona física: empieza por número o por K, L, M, X, Y o Z. Las sociedades no presentan el 130 (presentan el 202). */
export function esPersonaFisica(nif: string | null | undefined): boolean {
  const n = (nif || '').trim().toUpperCase().replace(/^ES/, '');
  if (!n) return true; // sin NIF todavía: lo normal en la app es un autónomo
  return /^[0-9KLMXYZ]/.test(n);
}

const facturasDelLibro = <T extends FacturaModelo>(facturas: T[]) => facturas.filter(cuentaEnLibro);

// ── Modelo 303 ────────────────────────────────────────────────────────────

const CASILLAS_IVA: Record<number, [string, string, string]> = {
  4: ['01', '02', '03'],
  10: ['04', '05', '06'],
  21: ['07', '08', '09'],
};

export interface LineaDevengado {
  tipo: number;
  base: number;
  cuota: number;
  /** Casillas de base, tipo y cuota; null si el tipo no es uno de los generales. */
  casillas: [string, string, string] | null;
}

export interface Modelo303 {
  anio: number;
  trimestre: Trimestre;
  devengado: LineaDevengado[];
  c27: number;
  c28: number;
  c29: number;
  c45: number;
  c46: number;
  c59: number;
  c120: number;
  /** Cuotas a compensar de trimestres anteriores del mismo año que se aplican aquí. */
  c78: number;
  c71: number;
  /** Lo que queda por compensar después de este trimestre. */
  quedaPorCompensar: number;
  hayDatos: boolean;
}

function liquidacion303(facturas: FacturaModelo[], gastos: GastoModelo[], anio: number, t: Trimestre) {
  const fs = facturasDelLibro(facturas).filter((f) => enPeriodo(f.issue_date, anio, t, false));
  const gs = gastos.filter((g) => enPeriodo(g.date, anio, t, false));

  const porTipo = new Map<number, LineaDevengado>();
  for (const f of fs) {
    const tipo = Number(f.tax_percent || 0);
    if (tipo <= 0) continue;
    const linea = porTipo.get(tipo) ?? { tipo, base: 0, cuota: 0, casillas: CASILLAS_IVA[tipo] ?? null };
    linea.base += f.subtotal_cents;
    linea.cuota += cuota(f.subtotal_cents, tipo);
    porTipo.set(tipo, linea);
  }
  const devengado = [...porTipo.values()].sort((a, b) => a.tipo - b.tipo);
  const c27 = devengado.reduce((s, l) => s + l.cuota, 0);

  const conIva = gs.filter((g) => (g.tax_percent || 0) > 0);
  const c28 = conIva.reduce((s, g) => s + g.amount_cents, 0);
  const c29 = conIva.reduce((s, g) => s + cuota(g.amount_cents, g.tax_percent), 0);

  const base = (motivos: string[]) =>
    fs.filter((f) => f.motivo_sin_iva && motivos.includes(f.motivo_sin_iva)).reduce((s, f) => s + f.subtotal_cents, 0);

  return {
    devengado,
    c27,
    c28,
    c29,
    c45: c29,
    c46: c27 - c29,
    c59: base(['inversion_sujeto_pasivo_ue']),
    c120: base(['no_sujeta_fuera_ue', 'no_sujeta_fuera_ue_particular']),
    hayDatos: fs.length > 0 || gs.length > 0,
  };
}

/**
 * Borrador del 303 de un trimestre. Un resultado negativo de un trimestre
 * anterior del mismo año se compensa en los siguientes (casilla 78). En el
 * 4T, un resultado negativo se puede pedir que se devuelva.
 */
export function modelo303(facturas: FacturaModelo[], gastos: GastoModelo[], anio: number, t: Trimestre): Modelo303 {
  let saldo = 0;
  let resultado: Modelo303 | null = null;
  for (let q = 1 as Trimestre; q <= t; q = (q + 1) as Trimestre) {
    const l = liquidacion303(facturas, gastos, anio, q);
    const c78 = l.c46 > 0 ? Math.min(saldo, l.c46) : 0;
    const c71 = l.c46 - c78;
    saldo = saldo - c78 + (c71 < 0 ? -c71 : 0);
    resultado = { anio, trimestre: q, ...l, c78, c71, quedaPorCompensar: saldo };
  }
  return resultado as Modelo303;
}

// ── Modelo 130 ────────────────────────────────────────────────────────────

export type Minoracion = 0 | 25 | 50 | 75 | 100;

export interface Opciones130 {
  /** Estimación directa simplificada (la de casi todos los autónomos): suma los gastos de difícil justificación. */
  simplificada: boolean;
  /** Minoración de la casilla 13, en euros, según el rendimiento neto del año anterior. */
  minoracionEuros: Minoracion;
}

export const OPCIONES_130_POR_DEFECTO: Opciones130 = { simplificada: true, minoracionEuros: 100 };

export interface Modelo130 {
  anio: number;
  trimestre: Trimestre;
  c01: number;
  /** Gastos registrados en la app (parte de la casilla 02). */
  gastosRegistrados: number;
  /** Gastos de difícil justificación (parte de la casilla 02). */
  dificilJustificacion: number;
  c02: number;
  c03: number;
  c04: number;
  c05: number;
  c06: number;
  c07: number;
  c12: number;
  c13: number;
  c14: number;
  c15: number;
  c17: number;
  c19: number;
  hayDatos: boolean;
}

/** Rendimiento neto (con difícil justificación si procede) de un periodo. */
function rendimiento(facturas: FacturaModelo[], gastos: GastoModelo[], simplificada: boolean) {
  const ingresos = facturas.reduce((s, f) => s + f.subtotal_cents, 0);
  const gastosRegistrados = gastos.reduce((s, g) => s + g.amount_cents, 0);
  const previo = ingresos - gastosRegistrados;
  const dificil = simplificada && previo > 0
    ? Math.min(Math.round(previo * (DIFICIL_JUSTIFICACION_PORCENTAJE / 100)), DIFICIL_JUSTIFICACION_MAXIMO_CENTS)
    : 0;
  return { ingresos, gastosRegistrados, dificil, neto: previo - dificil };
}

/** Borrador del 130 de un trimestre (acumulado desde el 1 de enero). */
export function modelo130(
  facturas: FacturaModelo[],
  gastos: GastoModelo[],
  anio: number,
  t: Trimestre,
  opciones: Opciones130 = OPCIONES_130_POR_DEFECTO,
): Modelo130 {
  const libro = facturasDelLibro(facturas);
  let pagadoAntes = 0; // suma de casillas 07 positivas de trimestres anteriores
  let negativosPendientes = 0; // casillas 19 negativas aún sin deducir
  let resultado: Modelo130 | null = null;

  for (let q = 1 as Trimestre; q <= t; q = (q + 1) as Trimestre) {
    const fs = libro.filter((f) => enPeriodo(f.issue_date, anio, q, true));
    const gs = gastos.filter((g) => enPeriodo(g.date, anio, q, true));
    const r = rendimiento(fs, gs, opciones.simplificada);

    const c01 = r.ingresos;
    const c02 = r.gastosRegistrados + r.dificil;
    const c03 = c01 - c02;
    const c04 = c03 > 0 ? Math.round(c03 * (TIPO_PAGO_FRACCIONADO / 100)) : 0;
    const c05 = pagadoAntes;
    const c06 = fs.reduce((s, f) => s + cuota(f.subtotal_cents, f.irpf_percent), 0);
    const c07 = c04 - c05 - c06;
    const c12 = Math.max(0, c07);
    const c13 = opciones.minoracionEuros * 100;
    const c14 = c12 - c13;
    const c15 = c14 > 0 ? Math.min(c14, negativosPendientes) : 0;
    const c17 = c14 - c15;
    const c19 = c17;

    if (c07 > 0) pagadoAntes += c07;
    negativosPendientes = negativosPendientes - c15 + (c19 < 0 ? -c19 : 0);

    resultado = {
      anio,
      trimestre: q,
      c01,
      gastosRegistrados: r.gastosRegistrados,
      dificilJustificacion: r.dificil,
      c02,
      c03,
      c04,
      c05,
      c06,
      c07,
      c12,
      c13,
      c14,
      c15,
      c17,
      c19,
      hayDatos: fs.length > 0 || gs.length > 0,
    };
  }
  return resultado as Modelo130;
}

/** Rendimiento neto de un año entero (para decidir la minoración del año siguiente). */
export function rendimientoNetoAnual(facturas: FacturaModelo[], gastos: GastoModelo[], anio: number, simplificada = true): number | null {
  const fs = facturasDelLibro(facturas).filter((f) => anioDe(f.issue_date) === anio);
  const gs = gastos.filter((g) => anioDe(g.date) === anio);
  if (fs.length === 0 && gs.length === 0) return null;
  return rendimiento(fs, gs, simplificada).neto;
}

/** Minoración de la casilla 13 según el rendimiento neto del año anterior (null = sin actividad → 100 €). */
export function minoracionPorRendimiento(rendimientoAnterior: number | null): Minoracion {
  if (rendimientoAnterior === null || rendimientoAnterior <= 900_000) return 100;
  if (rendimientoAnterior <= 1_000_000) return 75;
  if (rendimientoAnterior <= 1_100_000) return 50;
  if (rendimientoAnterior <= 1_200_000) return 25;
  return 0;
}

export interface Exencion130 {
  /** Parte de los ingresos con retención (0-100). */
  porcentaje: number;
  /** Qué ingresos se han mirado. */
  segun: 'año anterior' | 'primer trimestre';
  exento: boolean;
}

/**
 * Regla del 70 %: no hay que presentar el 130 si al menos el 70 % de los
 * ingresos del año anterior llevaron retención. Sin actividad el año
 * anterior, se miran los del primer trimestre de este año.
 * Devuelve null si todavía no hay ingresos con los que decidirlo.
 */
export function exencion130(facturas: FacturaModelo[], anio: number): Exencion130 | null {
  const libro = facturasDelLibro(facturas);
  const anterior = libro.filter((f) => anioDe(f.issue_date) === anio - 1);
  const muestra = anterior.length ? anterior : libro.filter((f) => enPeriodo(f.issue_date, anio, 1, false));
  const total = muestra.reduce((s, f) => s + f.subtotal_cents, 0);
  if (total <= 0) return null;
  const conRetencion = muestra.filter((f) => (f.irpf_percent || 0) > 0).reduce((s, f) => s + f.subtotal_cents, 0);
  const porcentaje = Math.round((conRetencion / total) * 1000) / 10;
  return { porcentaje, segun: anterior.length ? 'año anterior' : 'primer trimestre', exento: porcentaje >= 70 };
}

// ── Cuánto apartar ────────────────────────────────────────────────────────

export interface ImporteTrimestre {
  anio: number;
  trimestre: Trimestre;
  plazo: Plazo;
  /** A ingresar por el 303 (0 si sale a compensar o devolver). */
  iva: number;
  /** A ingresar por el 130 (0 si sale negativo, si no hay que presentarlo o si es una sociedad). */
  irpf: number;
  total: number;
  hayDatos: boolean;
}

export interface ReservaHacienda {
  /** El trimestre en curso, con lo facturado hasta hoy. */
  enCurso: ImporteTrimestre;
  /** El trimestre anterior, si hoy está dentro de su plazo de presentación. */
  porPresentar: ImporteTrimestre | null;
  presenta130: boolean;
  /** Por qué no se presenta el 130 este año (null si se presenta). */
  motivoSin130: 'sociedad' | 'retenciones' | null;
}

export interface OpcionesReserva {
  nif?: string | null;
  opciones130?: Opciones130;
}

function importeTrimestre(
  facturas: FacturaModelo[],
  gastos: GastoModelo[],
  anio: number,
  t: Trimestre,
  presenta130: boolean,
  opciones130: Opciones130,
): ImporteTrimestre {
  const m303 = modelo303(facturas, gastos, anio, t);
  const m130 = presenta130 ? modelo130(facturas, gastos, anio, t, opciones130) : null;
  const iva = Math.max(0, m303.c71);
  const irpf = m130 ? Math.max(0, m130.c19) : 0;
  return {
    anio,
    trimestre: t,
    plazo: plazoTrimestre(anio, t),
    iva,
    irpf,
    total: iva + irpf,
    hayDatos: m303.hayDatos || !!m130?.hayDatos,
  };
}

/** ¿Hay que presentar el 130 ese año? Personas físicas que no cumplen la regla del 70 %. */
export function presenta130(facturas: FacturaModelo[], anio: number, nif?: string | null): boolean {
  if (!esPersonaFisica(nif)) return false;
  return !exencion130(facturas, anio)?.exento;
}

/** Cuánto apartar: el trimestre en curso y, si su plazo está abierto, el anterior. `hoy` en AAAA-MM-DD. */
export function reservaHacienda(
  facturas: FacturaModelo[],
  gastos: GastoModelo[],
  hoy: string,
  { nif, opciones130 = OPCIONES_130_POR_DEFECTO }: OpcionesReserva = {},
): ReservaHacienda {
  const { anio, t } = trimestreActual(hoy);
  const presentaEste = presenta130(facturas, anio, nif);
  const enCurso = importeTrimestre(facturas, gastos, anio, t, presentaEste, opciones130);

  const ant = trimestreAnterior(anio, t);
  const plazoAnt = plazoTrimestre(ant.anio, ant.t);
  let porPresentar: ImporteTrimestre | null = null;
  if (hoy >= plazoAnt.desde && hoy <= plazoAnt.hasta) {
    const presentaAnt = presenta130(facturas, ant.anio, nif);
    porPresentar = importeTrimestre(facturas, gastos, ant.anio, ant.t, presentaAnt, opciones130);
  }
  const motivoSin130 = presentaEste ? null : esPersonaFisica(nif) ? 'retenciones' : 'sociedad';
  return { enCurso, porPresentar, presenta130: presentaEste, motivoSin130 };
}

/** Importe en céntimos como lo pide el formulario de la AEAT: «1234,56» (sin € ni puntos de miles). */
export const importeParaAeat = (cents: number): string => {
  const signo = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
};

/** Fecha de hoy en la zona del navegador, AAAA-MM-DD. */
export const hoyTexto = (): string => aTexto(new Date());
