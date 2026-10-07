// Verifactu, fase 3: NIF español con su control. Mismos casos que
// supabase/pruebas/verifactu-fase3.sql (verifactu_nif_valido en la base de datos).
import { describe, it, expect } from 'vitest';
import { nifEspanolValido } from '@/lib/verifactu/nif';

describe('NIF español', () => {
  it('acepta NIF reales o con el control correcto', () => {
    for (const nif of ['74870299D', '12345678Z', 'X1234567L', 'Y1234567X', 'Z1234567R', 'K1234567L',
      'Q2826000H', 'B12345674', 'A58818501', 'S2800568D', 'G12345674', 'G1234567D']) {
      expect(nifEspanolValido(nif), nif).toBe(true);
    }
  });

  it('rechaza letras o dígitos de control equivocados y formatos raros', () => {
    for (const nif of ['74870299A', '12345678A', 'X1234567A', 'Q2826000A', 'Q28260008', 'B12345678', 'B1234567D',
      'A5881850A', '1234567Z', '', 'ABCDEFGHI', 'I12345674']) {
      expect(nifEspanolValido(nif), nif).toBe(false);
    }
  });
});
