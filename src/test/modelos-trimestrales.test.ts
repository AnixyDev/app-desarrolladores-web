import { describe, it, expect } from 'vitest';
import {
  esPersonaFisica,
  exencion130,
  importeParaAeat,
  minoracionPorRendimiento,
  modelo130,
  modelo303,
  plazoTrimestre,
  presenta130,
  rendimientoNetoAnual,
  reservaHacienda,
} from '../../lib/modelosTrimestrales';

const f = (issue_date: string, subtotal_cents: number, tax_percent = 21, irpf_percent = 0, motivo_sin_iva: any = null) =>
  ({ issue_date, subtotal_cents, tax_percent, irpf_percent, motivo_sin_iva });
const g = (date: string, amount_cents: number, tax_percent = 21) => ({ date, amount_cents, tax_percent });
const sinDificil = { simplificada: false, minoracionEuros: 0 as const };

describe('Plazos de presentación', () => {
  it('1T-3T hasta el día 20 del mes siguiente; 4T hasta el 30 de enero; sábado o domingo pasan al lunes', () => {
    expect(plazoTrimestre(2026, 3)).toEqual({ desde: '2026-10-01', hasta: '2026-10-20', domiciliarHasta: '2026-10-15' });
    expect(plazoTrimestre(2026, 1).hasta).toBe('2026-04-20');
    // 30/01/2027 es sábado y 25/01/2027 lunes
    expect(plazoTrimestre(2026, 4)).toEqual({ desde: '2027-01-01', hasta: '2027-02-01', domiciliarHasta: '2027-01-25' });
    // 20/07/2025 fue domingo
    expect(plazoTrimestre(2025, 2).hasta).toBe('2025-07-21');
  });
});

describe('Modelo 303', () => {
  it('reparte por casillas: 21 %, UE (59), fuera de la UE (120) e IVA soportado', () => {
    const facturas = [
      f('2026-07-10', 100000, 21, 15),
      f('2026-08-01', 200000, 0, 0, 'inversion_sujeto_pasivo_ue'),
      f('2026-09-30', 80000, 0, 0, 'no_sujeta_fuera_ue'),
      f('2026-10-01', 999999), // ya es 4T
      f('2026-07-02', 30000, 0, 0), // 0 % sin motivo: no cuenta (aviso en el Libro)
    ];
    const gastos = [g('2026-07-05', 50000), g('2026-07-06', 29400, 0)];
    const m = modelo303(facturas, gastos, 2026, 3);
    expect(m.devengado).toEqual([{ tipo: 21, base: 100000, cuota: 21000, casillas: ['07', '08', '09'] }]);
    expect(m.c27).toBe(21000);
    expect(m.c28).toBe(50000);
    expect(m.c29).toBe(10500);
    expect(m.c45).toBe(10500);
    expect(m.c46).toBe(10500);
    expect(m.c59).toBe(200000);
    expect(m.c120).toBe(80000);
    expect(m.c71).toBe(10500);
  });

  it('un trimestre negativo se compensa en los siguientes del mismo año (casilla 78)', () => {
    const facturas = [f('2026-05-01', 100000), f('2026-08-01', 100000)];
    const gastos = [g('2026-01-15', 150000)]; // 1T: -315 €
    expect(modelo303(facturas, gastos, 2026, 1).c71).toBe(-31500);
    const t2 = modelo303(facturas, gastos, 2026, 2);
    expect(t2.c46).toBe(21000);
    expect(t2.c78).toBe(21000);
    expect(t2.c71).toBe(0);
    expect(t2.quedaPorCompensar).toBe(10500);
    const t3 = modelo303(facturas, gastos, 2026, 3);
    expect(t3.c78).toBe(10500);
    expect(t3.c71).toBe(10500);
    expect(t3.quedaPorCompensar).toBe(0);
  });

  it('una rectificativa por diferencias (importe negativo) resta', () => {
    const m = modelo303([f('2026-02-01', 100000), f('2026-03-01', -20000)], [], 2026, 1);
    expect(m.devengado[0]).toMatchObject({ base: 80000, cuota: 16800 });
  });
});

describe('Modelo 130', () => {
  it('es acumulado desde el 1 de enero y resta los pagos de trimestres anteriores', () => {
    const facturas = [f('2026-02-01', 500000), f('2026-05-01', 500000)];
    const gastos = [g('2026-02-10', 100000)];
    const t1 = modelo130(facturas, gastos, 2026, 1, sinDificil);
    expect(t1).toMatchObject({ c01: 500000, c02: 100000, c03: 400000, c04: 80000, c05: 0, c06: 0, c07: 80000, c19: 80000 });
    const t2 = modelo130(facturas, gastos, 2026, 2, sinDificil);
    expect(t2).toMatchObject({ c01: 1000000, c03: 900000, c04: 180000, c05: 80000, c07: 100000, c19: 100000 });
  });

  it('las retenciones de las facturas van en la casilla 06', () => {
    const t = modelo130([f('2026-02-01', 1000000, 21, 15)], [], 2026, 1, sinDificil);
    expect(t.c04).toBe(200000);
    expect(t.c06).toBe(150000);
    expect(t.c07).toBe(50000);
  });

  it('suma el 5 % de difícil justificación a los gastos, con máximo de 2.000 € al año', () => {
    const t = modelo130([f('2026-02-01', 1000000)], [g('2026-02-02', 200000)], 2026, 1, { simplificada: true, minoracionEuros: 0 });
    expect(t.dificilJustificacion).toBe(40000); // 5 % de 8.000 €
    expect(t.c02).toBe(240000);
    const grande = modelo130([f('2026-02-01', 10_000_000)], [], 2026, 1, { simplificada: true, minoracionEuros: 0 });
    expect(grande.dificilJustificacion).toBe(200000);
  });

  it('la minoración (casilla 13) puede dejar el resultado negativo, y se deduce en los trimestres siguientes (casilla 15)', () => {
    const opciones = { simplificada: false, minoracionEuros: 100 as const };
    const facturas = [f('2026-02-01', 20000), f('2026-05-01', 200000)];
    const t1 = modelo130(facturas, [], 2026, 1, opciones);
    expect(t1).toMatchObject({ c07: 4000, c12: 4000, c13: 10000, c14: -6000, c19: -6000 });
    const t2 = modelo130(facturas, [], 2026, 2, opciones);
    // 20 % de 2.200 € = 440 €, menos 40 € del 1T = 400 €; menos 100 € de minoración = 300 €; menos 60 € negativos del 1T
    expect(t2).toMatchObject({ c04: 44000, c05: 4000, c07: 40000, c14: 30000, c15: 6000, c19: 24000 });
  });

  it('sin beneficio no hay pago', () => {
    const t = modelo130([f('2026-02-01', 10000)], [g('2026-02-01', 50000)], 2026, 1, sinDificil);
    expect(t.c03).toBe(-40000);
    expect(t.c04).toBe(0);
    expect(t.c19).toBe(0);
  });

  it('minoración según el rendimiento del año anterior', () => {
    expect(minoracionPorRendimiento(null)).toBe(100);
    expect(minoracionPorRendimiento(900_000)).toBe(100);
    expect(minoracionPorRendimiento(950_000)).toBe(75);
    expect(minoracionPorRendimiento(1_050_000)).toBe(50);
    expect(minoracionPorRendimiento(1_200_000)).toBe(25);
    expect(minoracionPorRendimiento(1_200_001)).toBe(0);
    expect(rendimientoNetoAnual([f('2025-03-01', 1_000_000)], [], 2025, false)).toBe(1_000_000);
    expect(rendimientoNetoAnual([], [], 2025)).toBeNull();
  });

  it('regla del 70 %: con casi todo retenido no hay que presentarlo', () => {
    const conRetencion = [f('2025-03-01', 800000, 21, 15), f('2025-06-01', 200000, 0, 0, 'no_sujeta_fuera_ue')];
    expect(exencion130(conRetencion, 2026)).toEqual({ porcentaje: 80, segun: 'año anterior', exento: true });
    expect(presenta130(conRetencion, 2026, '12345678Z')).toBe(false);
    // Sin año anterior: el primer trimestre
    expect(exencion130([f('2026-02-01', 100000, 21, 0)], 2026)).toEqual({ porcentaje: 0, segun: 'primer trimestre', exento: false });
    expect(exencion130([], 2026)).toBeNull();
  });

  it('las sociedades no presentan el 130', () => {
    expect(esPersonaFisica('12345678Z')).toBe(true);
    expect(esPersonaFisica('X1234567L')).toBe(true);
    expect(esPersonaFisica('B12345678')).toBe(false);
    expect(esPersonaFisica('ESB12345678')).toBe(false);
    expect(presenta130([f('2026-02-01', 100000)], 2026, 'B12345678')).toBe(false);
  });
});

describe('Cuánto apartar para Hacienda', () => {
  const facturas = [f('2026-08-01', 300000), f('2026-10-05', 100000)];
  const gastos = [g('2026-08-02', 100000)];

  it('dentro del plazo del 3T enseña el 3T por presentar y lo que va del 4T', () => {
    const r = reservaHacienda(facturas, gastos, '2026-10-14', { nif: '12345678Z', opciones130: sinDificil });
    expect(r.porPresentar).toMatchObject({ anio: 2026, trimestre: 3, iva: 42000, irpf: 40000, total: 82000 });
    expect(r.porPresentar?.plazo.hasta).toBe('2026-10-20');
    // 4T: IVA 21 €... 210 € y 130 acumulado: 20 % de 3.000 € = 600 €, menos 400 € del 3T = 200 €
    expect(r.enCurso).toMatchObject({ trimestre: 4, iva: 21000, irpf: 20000, total: 41000 });
  });

  it('pasado el plazo ya no hay nada por presentar; una sociedad solo aparta IVA', () => {
    const r = reservaHacienda(facturas, gastos, '2026-10-21', { nif: 'B12345678' });
    expect(r.porPresentar).toBeNull();
    expect(r.presenta130).toBe(false);
    expect(r.enCurso.irpf).toBe(0);
    expect(r.enCurso.total).toBe(21000);
  });

  it('el 4T se presenta en enero del año siguiente', () => {
    const r = reservaHacienda(facturas, gastos, '2027-01-10', { nif: '12345678Z', opciones130: sinDificil });
    expect(r.porPresentar).toMatchObject({ anio: 2026, trimestre: 4 });
    expect(r.enCurso).toMatchObject({ anio: 2027, trimestre: 1, total: 0, hayDatos: false });
  });
});

describe('Importes para pegar en la AEAT', () => {
  it('sin símbolo ni puntos de miles, con coma decimal', () => {
    expect(importeParaAeat(123456)).toBe('1234,56');
    expect(importeParaAeat(5)).toBe('0,05');
    expect(importeParaAeat(-31500)).toBe('-315,00');
  });
});
