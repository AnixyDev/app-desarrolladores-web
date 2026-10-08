// Comprobación previa a emitir una factura: mismas reglas que
// registrar_factura_fiscal (supabase/pruebas/verifactu-registro.sql).
import { describe, it, expect } from 'vitest';
import { problemaRegistroFiscal, normalizarNif } from '@/lib/verifactu/comprobarFactura';

const HOY = '2026-10-07';
const perfil = { tax_id: '12345678z', business_name: 'Estudio', full_name: 'Ana' };
const es = { name: 'Cliente', company: '', tax_id: 'B-1234567-4', tipo_fiscal: 'nacional' as const, nif_iva: null, pais: null };
const f = (subtotal: number, iva = 21, fecha = HOY) => ({ issue_date: fecha, subtotal_cents: subtotal, tax_percent: iva });

describe('comprobación previa al registro fiscal', () => {
  it('normaliza el NIF como la base de datos', () => {
    expect(normalizarNif(' es-b12.345.678 ')).toBe('B12345678');
    expect(normalizarNif('')).toBeNull();
  });

  it('factura nacional correcta', () => {
    expect(problemaRegistroFiscal(f(100000), es, perfil, HOY)).toBeNull();
  });

  it('sin NIF del emisor o con fecha futura, no', () => {
    expect(problemaRegistroFiscal(f(1000), es, { ...perfil, tax_id: '' }, HOY)).toMatch(/Falta tu NIF/);
    expect(problemaRegistroFiscal(f(1000, 21, '2026-10-08'), es, perfil, HOY)).toMatch(/posterior a hoy/);
  });

  it('cliente sin NIF: simplificada hasta 400 € con IVA; por encima, hay que identificarlo', () => {
    const sinNif = { ...es, tax_id: '' };
    expect(problemaRegistroFiscal(f(30000), sinNif, perfil, HOY)).toBeNull();      // 363 €
    expect(problemaRegistroFiscal(f(50000), sinNif, perfil, HOY)).toMatch(/400 €/); // 605 €
  });

  it('cliente de España sin IVA, no', () => {
    expect(problemaRegistroFiscal(f(1000, 0), es, perfil, HOY)).toMatch(/lleva IVA/);
  });

  it('empresa de la UE sin IVA, con NIF-IVA', () => {
    const ue = { ...es, tipo_fiscal: 'empresa_ue' as const, nif_iva: 'FR12345678901' };
    expect(problemaRegistroFiscal(f(60000, 0), ue, perfil, HOY)).toBeNull();
    expect(problemaRegistroFiscal(f(60000, 0), { ...ue, nif_iva: null }, perfil, HOY)).toMatch(/NIF-IVA/);
  });

  it('cliente de fuera de la UE: con documento hace falta el país', () => {
    const us = { ...es, tipo_fiscal: 'fuera_ue' as const, tax_id: 'X1234567', pais: 'US' };
    expect(problemaRegistroFiscal(f(80000, 0), us, perfil, HOY)).toBeNull();
    expect(problemaRegistroFiscal(f(80000, 0), { ...us, pais: null }, perfil, HOY)).toMatch(/país/);
  });

  it('NIF con la letra o el dígito de control mal: no (la AEAT lo rechazaría)', () => {
    expect(problemaRegistroFiscal(f(1000), { ...es, tax_id: 'B12345678' }, perfil, HOY)).toMatch(/revisa que esté bien escrito/);
    expect(problemaRegistroFiscal(f(1000), es, { ...perfil, tax_id: '12345678A' }, HOY)).toMatch(/Tu NIF/);
  });

  it('tipo de IVA que Hacienda no admite', () => {
    expect(problemaRegistroFiscal(f(1000, 15), es, perfil, HOY)).toMatch(/no es un tipo válido/);
  });
});

describe('factura recurrente', () => {
  it('el modal de recurrentes comprueba el cliente antes de guardar (se emitirá sin nadie delante)', async () => {
    const { readFileSync } = await import('node:fs');
    const modal = readFileSync('components/modals/CreateRecurringInvoiceModal.tsx', 'utf8');
    expect(modal).toMatch(/problemaRegistroFiscal\(/);
    expect(modal).toMatch(/profile\?\.veri_factu_enabled/);
  });
});
