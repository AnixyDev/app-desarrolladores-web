import { describe, it, expect } from 'vitest';
import { aEuros, porcentajeAhorroAnual, AHORRO_PRO, AHORRO_TEAM, ahorroMaximo } from '../../lib/ahorroAnual';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ahorro del pago anual', () => {
  it('lee importes con coma y símbolo', () => {
    expect(aEuros('9,95€')).toBe(9.95);
    expect(aEuros('1,95 €')).toBe(1.95);
    expect(aEuros('1.234,50 €')).toBe(1234.5);
    expect(aEuros('')).toBeNull();
  });

  it('Pro: 99,95 € frente a 119,40 € → 16 %', () => {
    expect(AHORRO_PRO()).toBe(16);
  });

  it('Team: 395 € frente a 551,40 € → 28 %', () => {
    expect(AHORRO_TEAM()).toBe(28);
  });

  it('el selector anuncia el mayor de los dos', () => {
    expect(ahorroMaximo()).toBe(28);
  });

  it('sin precio no inventa ahorro', () => {
    expect(porcentajeAhorroAnual('noExiste', 'proPlanYearly')).toBeNull();
  });

  it('ninguna pantalla vuelve a escribir el -20 % a mano', () => {
    for (const ruta of ['pages/PricingPage.tsx', 'pages/BillingPage.tsx']) {
      const fuente = readFileSync(resolve(__dirname, '../..', ruta), 'utf8');
      expect(fuente).not.toMatch(/-20%/);
      expect(fuente).not.toMatch(/Más Popular/);
    }
  });
});
