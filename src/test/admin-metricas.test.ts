import { describe, it, expect } from 'vitest';
import { beneficioNeto30d, STRIPE_FIJO_CENTS, STRIPE_PORCENTAJE, INFRA_MENSUAL_CENTS } from '../../lib/adminMetricas';

describe('beneficio neto estimado del panel', () => {
    it('resta la comisión de Stripe por cobro y la infraestructura del mes', () => {
        // 2 cobros de 9,95 €: 1990 - (2·25 + 1990·1,5 %) - 82
        const esperado = Math.round(1990 - (2 * STRIPE_FIJO_CENTS + 1990 * STRIPE_PORCENTAJE) - INFRA_MENSUAL_CENTS);
        expect(beneficioNeto30d({ ingresos_30d_cents: 1990, cobros_30d: 2 })).toBe(esperado);
        expect(esperado).toBe(1828);
    });
    it('sin cobros: solo el coste de infraestructura', () => {
        expect(beneficioNeto30d({ ingresos_30d_cents: 0, cobros_30d: 0 })).toBe(-INFRA_MENSUAL_CENTS);
    });
});
