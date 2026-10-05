import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importesDeRecurrente } from '../../supabase/functions/process-recurring-invoices/importes';
import { totalesDeFactura } from '../../hooks/store/financeSlice';

const lineas = [{ price_cents: 100000, quantity: 1 }, { price_cents: 2500, quantity: 1.5 }];

describe('importes de las facturas recurrentes', () => {
  it('aplican el IRPF de la recurrente: base + IVA − IRPF', () => {
    const r = importesDeRecurrente(lineas, 21, 15, 'nacional')!;
    expect(r.subtotal).toBe(103750);
    expect(r.taxPercent).toBe(21);
    expect(r.irpfPercent).toBe(15);
    // 1.037,50 + 217,88 − 155,63 = 1.099,75
    expect(r.total).toBe(109975);
  });

  it('dan el mismo total que una factura creada a mano en la app', () => {
    const r = importesDeRecurrente(lineas, 21, 7, null)!;
    expect(r.total).toBe(totalesDeFactura(lineas as any, 21, 7).total);
  });

  it('sin IRPF guardado (recurrentes antiguas) no retienen', () => {
    expect(importesDeRecurrente(lineas, 21, undefined)!.irpfPercent).toBe(0);
  });

  it('cliente de otro país: sin IVA ni IRPF aunque la recurrente los tenga', () => {
    for (const tipo of ['empresa_ue', 'fuera_ue']) {
      const r = importesDeRecurrente(lineas, 21, 15, tipo)!;
      expect([r.taxPercent, r.irpfPercent, r.total]).toEqual([0, 0, 103750]);
    }
  });

  it('porcentajes fuera de rango cuentan como 0 y las líneas no numéricas se rechazan', () => {
    expect(importesDeRecurrente(lineas, 150, -3)!.total).toBe(103750);
    expect(importesDeRecurrente([{ price_cents: 'x', quantity: 1 }], 21, 0)).toBeNull();
  });

  it('la función del servidor guarda el IRPF en la factura y registra la huella', () => {
    const f = readFileSync(resolve(__dirname, '../../supabase/functions/process-recurring-invoices/index.ts'), 'utf8');
    expect(f).toMatch(/irpf_percent: importes\.irpfPercent/);
    expect(f).toMatch(/rpc\('registrar_factura_fiscal'/);
  });
});
