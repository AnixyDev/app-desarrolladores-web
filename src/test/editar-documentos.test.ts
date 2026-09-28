import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { accionesDeFactura } from '../../pages/InvoicesPage';
import { tituloDeFactura } from '../../services/pdfService';
import { totalesDeFactura } from '../../hooks/store/financeSlice';
import { formularioDesdeProyecto } from '../../components/projects/ProjectFormModal';
import {
    correoDeFactura, correoDeContrato, correoDePresupuesto, correoDePropuesta, correoDeRecibo,
    TIPOS_DE_DOCUMENTO,
} from '../../supabase/functions/_shared/correo-documentos';

/**
 * 28/09: una vez creados, casi ningún documento se podía editar, borrar ni
 * volver a enviar. Estas pruebas fijan qué se puede hacer con cada uno.
 */

describe('acciones de una factura', () => {
    const normal = { fiscal_locked: false, is_rectified: false, total_cents: 12100 };
    const bloqueada = { fiscal_locked: true, is_rectified: false, total_cents: 12100 };

    it('sin registro fiscal ni cobros: editar y borrar', () => {
        const a = accionesDeFactura(normal, 'PENDIENTE');
        expect(a).toMatchObject({ editar: true, borrar: true, rectificar: false, anular: false, cobrar: true });
    });

    it('con cobros: ya no se edita (el importe cobrado dejaría de cuadrar)', () => {
        expect(accionesDeFactura(normal, 'PARCIAL').editar).toBe(false);
        expect(accionesDeFactura(normal, 'PAGADA')).toMatchObject({ editar: false, cobrar: false });
    });

    it('con registro fiscal: ni editar ni borrar; rectificar o anular', () => {
        const a = accionesDeFactura(bloqueada, 'PENDIENTE');
        expect(a).toMatchObject({ editar: false, borrar: false, rectificar: true, anular: true });
    });

    it('ya rectificada: nada más que descargar y reenviar', () => {
        const a = accionesDeFactura({ ...bloqueada, is_rectified: true }, 'RECTIFICADA');
        expect(a).toMatchObject({ editar: false, borrar: false, rectificar: false, anular: false, cobrar: false });
    });

    it('un abono (total negativo) no se cobra', () => {
        expect(accionesDeFactura({ ...bloqueada, total_cents: -12100 }, 'ABONO').cobrar).toBe(false);
    });
});

describe('totales de factura', () => {
    it('misma fórmula al crear y al editar', () => {
        expect(totalesDeFactura([{ description: 'Web', quantity: 2, price_cents: 10000 }], 21, 15))
            .toEqual({ subtotal: 20000, total: 21200 });
    });
});

describe('PDF', () => {
    it('la rectificativa se titula como tal', () => {
        expect(tituloDeFactura({ rectifies_invoice_id: null })).toBe('FACTURA');
        expect(tituloDeFactura({ rectifies_invoice_id: 'x' })).toBe('FACTURA RECTIFICATIVA');
        expect(tituloDeFactura({ rectifies_invoice_id: 'x' }, 'verifactu')).toBe('FACTURA RECTIFICATIVA (VERI*FACTU)');
    });
});

describe('correos', () => {
    it('se envían los cinco tipos de documento', () => {
        expect([...TIPOS_DE_DOCUMENTO].sort()).toEqual(['contrato', 'factura', 'presupuesto', 'propuesta', 'recibo']);
    });

    it('rectificativa a la baja: sin enlace de pago y diciendo qué corrige', () => {
        const c = correoDeFactura({ cliente: 'Ana', numero: 'R-2026-0001', totalCents: -12100, enlacePago: 'https://x/pay/1', rectificaA: 'INV-2026-0003' });
        expect(c.asunto).toBe('Factura rectificativa R-2026-0001');
        expect(c.html).toContain('INV-2026-0003');
        expect(c.html).not.toContain('/pay/');
    });

    it('factura normal: con enlace de pago', () => {
        const c = correoDeFactura({ cliente: 'Ana', numero: 'INV-1', totalCents: 1000, enlacePago: 'https://x/pay/1' });
        expect(c.asunto).toBe('Factura INV-1');
        expect(c.html).toContain('/pay/1');
    });

    it('contrato firmado: se manda la copia, no se pide firma', () => {
        const c = correoDeContrato({ cliente: 'Ana', proyecto: 'Web', firma: 'Yo', enlacePortal: 'https://x', firmado: true });
        expect(c.asunto).toBe('Contrato firmado del proyecto "Web"');
        expect(c.html).not.toContain('firmarlo');
    });

    it('presupuesto, propuesta y recibo: asunto, importe y sin HTML inyectado', () => {
        const p = correoDePresupuesto({ cliente: '<b>x</b>', descripcion: 'Tienda', importeCents: 150000, enlacePortal: 'https://x/portal/budgets/1', firma: 'Yo' });
        expect(p.asunto).toBe('Presupuesto: Tienda');
        expect(p.html).toContain('/portal/budgets/1');
        expect(p.html).not.toContain('<b>x</b>');
        const q = correoDePropuesta({ cliente: 'Ana', titulo: 'App', importeCents: 100, enlacePortal: 'https://x/portal/proposals/1', firma: 'Yo' });
        expect(q.asunto).toBe('Propuesta: App');
        const r = correoDeRecibo({ cliente: 'Ana', numero: 'REC-1', concepto: 'Arreglo', importeCents: 5000, firma: 'Yo' });
        expect(r.asunto).toBe('Recibo REC-1');
        expect(r.html).toContain('50,00');
    });
});

describe('editar proyecto', () => {
    it('el formulario sale del proyecto guardado, con el presupuesto en euros', () => {
        const f = formularioDesdeProyecto({
            id: 'p', user_id: 'u', name: 'Web', client_id: 'c', status: 'planning',
            start_date: '2026-09-01T00:00:00', due_date: '2026-10-01', budget_cents: 150050,
            created_at: '', category: '', priority: 'High',
        });
        expect(f).toMatchObject({ name: 'Web', budget: '1500.5', start_date: '2026-09-01', due_date: '2026-10-01', priority: 'High' });
    });
});
