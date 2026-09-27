import { describe, it, expect } from 'vitest';
import { suscripcionDeLaFactura } from '../../supabase/functions/_shared/stripe-facturas';

/**
 * El endpoint del webhook en Stripe está en la versión 2025-09-30.clover. En
 * esa versión la factura ya no trae `subscription`: sin leer `parent`, el
 * programa de afiliados nunca registraría una comisión.
 */
describe('suscripcionDeLaFactura', () => {
    it('forma nueva (basil / clover): parent.subscription_details', () => {
        expect(suscripcionDeLaFactura({
            parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_123' } },
        })).toBe('sub_123');
    });

    it('forma nueva con la suscripción expandida', () => {
        expect(suscripcionDeLaFactura({
            parent: { type: 'subscription_details', subscription_details: { subscription: { id: 'sub_456' } } },
        })).toBe('sub_456');
    });

    it('forma antigua: invoice.subscription', () => {
        expect(suscripcionDeLaFactura({ subscription: 'sub_789' })).toBe('sub_789');
    });

    it('factura suelta (sin suscripción) o de un presupuesto: null', () => {
        expect(suscripcionDeLaFactura({ parent: null })).toBeNull();
        expect(suscripcionDeLaFactura({ parent: { type: 'quote_details', quote_details: { quote: 'qt_1' } } })).toBeNull();
        expect(suscripcionDeLaFactura({})).toBeNull();
    });
});

import { precioDeLaFactura } from '../../supabase/functions/_shared/stripe-facturas';

describe('precioDeLaFactura (para saber si el cobro es de Pro o de equipos)', () => {
    it('forma clover: lines.data[0].pricing.price_details.price', () => {
        expect(precioDeLaFactura({ lines: { data: [{ pricing: { price_details: { price: 'price_pro' } } }] } })).toBe('price_pro');
    });
    it('forma antigua: lines.data[0].price.id', () => {
        expect(precioDeLaFactura({ lines: { data: [{ price: { id: 'price_teams' } }] } })).toBe('price_teams');
    });
    it('sin líneas: null', () => {
        expect(precioDeLaFactura({ lines: { data: [] } })).toBeNull();
        expect(precioDeLaFactura({})).toBeNull();
    });
});
