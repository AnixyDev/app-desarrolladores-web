import { describe, it, expect } from 'vitest';
import { colorRgb, sumarDias, referenciaDe, lineasDe, totalesDe, fechaLarga, datosDelPresupuesto, datosDeLaPropuesta } from '../../services/pdfOfertas';
import { generateBudgetPdfBase64 } from '../../services/pdfService';

describe('PDF de presupuestos y propuestas', () => {
    it('color de marca con respaldo', () => {
        expect(colorRgb('#d9009f')).toEqual([217, 0, 159]);
        expect(colorRgb('rojo')).toEqual([217, 0, 159]);
        expect(colorRgb('00ff00')).toEqual([0, 255, 0]);
    });
    it('fechas sin husos horarios', () => {
        expect(sumarDias('2026-09-28', 30)).toBe('2026-10-28');
        expect(sumarDias('2026-12-20', 15)).toBe('2027-01-04');
        expect(fechaLarga('2026-10-28')).toBe('28 de octubre de 2026');
    });
    it('referencia corta y estable', () => {
        expect(referenciaDe('PRES', '3f9a1c22-0000-4000-8000-000000000001', '2026-09-28')).toBe('PRES-2026-3F9A1C');
    });
    it('sin conceptos: una línea con el importe; IVA y total', () => {
        expect(lineasDe([], 'Web', 150000)).toEqual([{ description: 'Web', quantity: 1, price_cents: 150000 }]);
        expect(totalesDe(150000, 21)).toEqual({ base: 150000, iva: 31500, total: 181500 });
    });
    it('validez: 30 días el presupuesto; la propuesta usa su fecha', () => {
        const b = datosDelPresupuesto({ id: 'a', user_id: 'u', client_id: 'c', description: 'Tienda', items: [], amount_cents: 100, status: 'pending', created_at: '2026-09-28T10:00:00Z' }, 'x@y.com');
        expect(b.validoHasta).toBe('2026-10-28');
        expect(b.enlacePortal).toContain('/portal/budgets/a?email=x%40y.com');
        const p = datosDeLaPropuesta({ id: 'p', user_id: 'u', client_id: 'c', title: 'Web', content: 'x', amount_cents: 100, status: 'draft', items: [], valid_until: '2026-10-13T00:00:00Z', created_at: '2026-09-28' });
        expect(p.validoHasta).toBe('2026-10-13');
    });
    it('genera un PDF válido', () => {
        const b64 = generateBudgetPdfBase64(
            { id: 'a', user_id: 'u', client_id: 'c', description: 'Tienda', items: [{ description: 'Diseño', quantity: 1, price_cents: 90000 }], amount_cents: 90000, status: 'pending', created_at: '2026-09-28' },
            { name: 'Virginia', email: 'v@ejemplo.com' },
            { full_name: 'Ana', business_name: 'Anixy', tax_id: '12345678Z', email: 'a@ejemplo.com', pdf_color: '#d9009f' } as any,
        );
        expect(b64.startsWith('JVBERi0')).toBe(true);
    });
});
