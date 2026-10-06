import { describe, it, expect } from 'vitest';
import { clasificarFacturas, cuentaEnLibro, totalesLibro, ETIQUETA_SIN_IVA } from '../../lib/libroFiscal';

const f = (subtotal_cents: number, tax_percent: number, irpf_percent: number, motivo_sin_iva: any = null) =>
  ({ subtotal_cents, tax_percent, irpf_percent, motivo_sin_iva });

describe('Libro Fiscal: qué facturas cuentan', () => {
  it('cuentan las de IVA o IRPF y las de clientes extranjeros; quedan aparte las de 0 % sin motivo', () => {
    const nacional = f(100000, 21, 15);
    const soloIva = f(50000, 21, 0);
    const ue = f(200000, 0, 0, 'inversion_sujeto_pasivo_ue');
    const fueraUe = f(80000, 0, 0, 'no_sujeta_fuera_ue');
    const sospechosa = f(30000, 0, 0, null);
    const { incluidas, revisar } = clasificarFacturas([nacional, soloIva, ue, fueraUe, sospechosa]);
    expect(incluidas).toEqual([nacional, soloIva, ue, fueraUe]);
    expect(revisar).toEqual([sospechosa]);
    expect(cuentaEnLibro(ue)).toBe(true);
    expect(cuentaEnLibro(sospechosa)).toBe(false);
  });

  it('las facturas a extranjeros suman al ingreso y al beneficio del 130, sin IVA repercutido', () => {
    const facturas = [f(100000, 21, 15), f(200000, 0, 0, 'inversion_sujeto_pasivo_ue')];
    const gastos = [{ amount_cents: 50000, tax_percent: 21 }];
    const t = totalesLibro(facturas, gastos, 20);
    expect(t.totalIngresos).toBe(300000);
    expect(t.baseSinIva).toBe(200000);
    expect(t.ivaRepercutido).toBe(21000);
    expect(t.ivaSoportado).toBe(10500);
    expect(t.ivaAPagar).toBe(10500);
    expect(t.beneficio).toBe(250000);
    expect(t.totalRetenciones).toBe(15000);
    // 20 % de 2.500 € = 500 €, menos 150 € de retenciones = 350 €
    expect(t.irpfAPagar).toBe(35000);
  });

  it('sin beneficio no hay pago fraccionado', () => {
    const t = totalesLibro([f(10000, 21, 0)], [{ amount_cents: 50000, tax_percent: 21 }], 20);
    expect(t.irpfAPagar).toBe(0);
  });

  it('hay una etiqueta para cada motivo sin IVA (columna Observaciones del CSV)', () => {
    expect(Object.keys(ETIQUETA_SIN_IVA).sort()).toEqual(['inversion_sujeto_pasivo_ue', 'no_sujeta_fuera_ue', 'no_sujeta_fuera_ue_particular']);
  });
});
