// Causa de la rectificativa → tipo de factura en Verifactu (gestoría, 07/10/2026).
// Mismos casos que supabase/pruebas/verifactu-gestoria.sql.
import { describe, it, expect } from 'vitest';
import { tipoRectificativa, CAUSAS_RECTIFICACION } from '@/lib/verifactu/causaRectificacion';

describe('tipo de rectificativa según la causa', () => {
  it('descuento, cancelación y error en el IVA → R1; otro motivo o sin causa → R4', () => {
    expect(tipoRectificativa('descuento', 'F1')).toBe('R1');
    expect(tipoRectificativa('cancelacion', 'F1')).toBe('R1');
    expect(tipoRectificativa('error_iva', 'R1')).toBe('R1');
    expect(tipoRectificativa('otro', 'F1')).toBe('R4');
    expect(tipoRectificativa(null, 'F1')).toBe('R4');
  });

  it('la rectificativa de una simplificada siempre es R5', () => {
    expect(tipoRectificativa('descuento', 'F2')).toBe('R5');
    expect(tipoRectificativa('otro', 'R5')).toBe('R5');
  });

  it('las cuatro causas que se ofrecen', () => {
    expect(CAUSAS_RECTIFICACION.map((c) => c.valor)).toEqual(['descuento', 'cancelacion', 'error_iva', 'otro']);
  });
});
