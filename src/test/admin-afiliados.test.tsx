import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Panel de comisiones de afiliados. Quién puede usarlo y que el importe cuadre
 * lo decide la base de datos (supabase/pruebas/pagos-de-comisiones.sql). Aquí:
 * que la pantalla mande el importe que se enseñó, traduzca los errores, y que
 * /admin no se pinte para quien no es Admin.
 */

const { rpc, estado } = vi.hoisted(() => ({
    rpc: vi.fn(),
    estado: { profile: { id: 'u1', role: 'Admin' } as any, isProfileLoading: false },
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/hooks/useAppStore', () => ({ useAppStore: (sel: any) => sel(estado) }));

import { mensajeDeErrorDePago, totalesDelResumen, marcarComisionesPagadas } from '../../lib/adminAfiliados';
import { repartoDeCobro } from '../../lib/afiliados';
import ComisionesAfiliados from '../../components/admin/ComisionesAfiliados';
import AdminDashboard from '../../pages/AdminDashboard';

const fila = {
    referrer_id: 'a1', nombre: 'Lucía Diseño', email: 'lucia@ejemplo.com',
    referidos: 3, suscritos: 2, pendiente_cents: '398', pagado_cents: 199,
    ultima_comision: '2026-09-27T10:00:00Z', ultimo_pago: null,
};

beforeEach(() => {
    rpc.mockReset();
    estado.profile = { id: 'u1', role: 'Admin' };
});

describe('errores del pago, en palabras', () => {
    it.each([
        ['40001', /comisión nueva/],
        ['P0002', /ya no tiene comisiones pendientes/],
        ['42501', /rol Admin/],
    ])('%s', (code, texto) => expect(mensajeDeErrorDePago({ code })).toMatch(texto));
});

describe('cuentas', () => {
    it('totales del panel', () => {
        expect(totalesDelResumen([
            { ...fila, pendiente_cents: 398, pagado_cents: 199 } as any,
            { ...fila, referrer_id: 'a2', pendiente_cents: 0, pagado_cents: 500 } as any,
        ])).toEqual({ pendiente: 398, pagado: 699, afiliadosConPendiente: 1 });
    });

    it('la página del afiliado separa pendiente y cobrado', () => {
        expect(repartoDeCobro([
            { comision_cents: 199, pago_id: null },
            { comision_cents: 199, pago_id: 'p1' },
            { comision_cents: 100, pago_id: null },
        ])).toEqual({ pendiente: 299, cobrado: 199 });
    });

    it('al marcar como pagado manda el importe que se vio y la nota limpia', async () => {
        rpc.mockResolvedValue({ data: {}, error: null });
        await marcarComisionesPagadas('a1', 398, '  Bizum  ');
        expect(rpc).toHaveBeenCalledWith('admin_marcar_comisiones_pagadas',
            { p_referrer: 'a1', p_importe_esperado: 398, p_nota: 'Bizum' });
    });
});

describe('pantalla', () => {
    it('enseña lo pendiente y confirma el pago con el importe mostrado', async () => {
        rpc.mockImplementation(async (fn: string) => {
            if (fn === 'admin_resumen_afiliados') return { data: [fila], error: null };
            if (fn === 'admin_comisiones_pendientes') return {
                data: [{ id: 'c1', created_at: '2026-09-27T10:00:00Z', invitado: 'Pepe', base_cents: 995, comision_cents: 199, stripe_invoice_id: 'in_1' },
                       { id: 'c2', created_at: '2026-09-27T11:00:00Z', invitado: 'Pepe', base_cents: 995, comision_cents: 199, stripe_invoice_id: 'in_2' }],
                error: null,
            };
            return { data: {}, error: null };
        });

        render(<ComisionesAfiliados />);
        await screen.findByText('Lucía Diseño');
        fireEvent.click(screen.getByRole('button', { name: /Marcar como pagado/ }));
        const confirmar = await screen.findByRole('button', { name: /Confirmar pago de/ });
        await waitFor(() => expect(confirmar).not.toBeDisabled());
        fireEvent.click(confirmar);

        await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_marcar_comisiones_pagadas',
            { p_referrer: 'a1', p_importe_esperado: 398, p_nota: null }));
    });

    it('/admin no se pinta para una cuenta que no es Admin', () => {
        estado.profile = { id: 'u2', role: 'Developer' };
        render(<AdminDashboard />);
        expect(screen.getByText(/solo está disponible para la administración/)).toBeTruthy();
        expect(rpc).not.toHaveBeenCalled();
    });
});
