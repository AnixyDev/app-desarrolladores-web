import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Plan Teams: "200 Créditos IA compartidos". Un miembro activo del equipo
 * gasta del saldo del dueño (lo decide la base de datos: ver
 * supabase/pruebas y la migración creditos_compartidos_del_equipo). Aquí se
 * comprueba la parte de pantalla: que el miembro VEA ese saldo y no el suyo,
 * porque todas las pantallas deciden con profile.ai_credits si dejan usar la
 * IA — con su saldo propio (10 de una cuenta Free) se le bloquearía aunque el
 * equipo tuviera 200.
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc } }));

import { conSaldoDeCreditos } from '../../hooks/store/authSlice';

const perfil = { id: 'u1', ai_credits: 10, plan: 'Free' } as any;

beforeEach(() => { rpc.mockReset(); });

describe('conSaldoDeCreditos', () => {
    it('miembro de un equipo Teams: ve el saldo del equipo, marcado como compartido', async () => {
        rpc.mockResolvedValue({ data: [{ saldo: 196, compartido: true }], error: null });
        const r = await conSaldoDeCreditos(perfil);
        expect(rpc).toHaveBeenCalledWith('saldo_creditos_ia');
        expect(r.ai_credits).toBe(196);
        expect(r.creditos_compartidos).toBe(true);
    });

    it('cuenta normal: su propio saldo, sin marca', async () => {
        rpc.mockResolvedValue({ data: [{ saldo: 10, compartido: false }], error: null });
        const r = await conSaldoDeCreditos(perfil);
        expect(r.ai_credits).toBe(10);
        expect(r.creditos_compartidos).toBe(false);
    });

    it('si la consulta devuelve error, se queda el perfil tal cual', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
        expect(await conSaldoDeCreditos(perfil)).toEqual(perfil);
    });

    it('si la red falla, también', async () => {
        rpc.mockImplementation(async () => { throw new Error('sin red'); });
        expect(await conSaldoDeCreditos(perfil)).toEqual(perfil);
    });

    it('no toca el resto del perfil', async () => {
        rpc.mockResolvedValue({ data: [{ saldo: 50, compartido: true }], error: null });
        const r = await conSaldoDeCreditos(perfil);
        expect(r.id).toBe('u1');
        expect(r.plan).toBe('Free');
    });
});
