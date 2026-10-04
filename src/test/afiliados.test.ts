import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Programa de afiliados, parte del navegador. Las comisiones las registra el
 * servidor (ver supabase/pruebas/programa-de-afiliados.sql); aquí se
 * comprueba que el código del enlace llega al alta y que, si el alta fue con
 * Google, se vincula después sin romper nada.
 */

const { rpc, signUp, supabaseFalso } = vi.hoisted(() => {
    const rpc = vi.fn();
    const signUp = vi.fn();
    return { rpc, signUp, supabaseFalso: { rpc, auth: { signUp } } };
});
vi.mock('@/lib/supabaseClient', () => ({ supabase: supabaseFalso }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseFalso }));

import {
    normalizarCodigo,
    codigoDeLaUrl,
    urlDeVueltaConReferido,
    vincularReferido,
    borrarClavesAntiguas,
    estadisticasDeReferidos,
} from '../../lib/afiliados';
import { createAuthSlice } from '../../hooks/store/authSlice';

beforeEach(() => {
    rpc.mockReset();
    signUp.mockReset();
    localStorage.clear();
});

describe('código de afiliado', () => {
    it('acepta el formato de los códigos reales y lo normaliza', () => {
        expect(normalizarCodigo('602BD2AA')).toBe('602bd2aa');
        expect(normalizarCodigo('  a0dcb525 ')).toBe('a0dcb525');
    });

    it.each([null, undefined, '', 'ab', 'con espacios', "x'; drop table", 'a'.repeat(40)])(
        'descarta %s', (c) => expect(normalizarCodigo(c as any)).toBeNull());

    it('lo lee del enlace /register?ref=', () => {
        expect(codigoDeLaUrl('?ref=602bd2aa')).toBe('602bd2aa');
        expect(codigoDeLaUrl('?utm=x&ref=0193B958')).toBe('0193b958');
        expect(codigoDeLaUrl('')).toBeNull();
    });
});

describe('alta con correo', () => {
    it('manda el código en los metadatos, para que la base de datos cree el referido', async () => {
        signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
        const slice = createAuthSlice(vi.fn(), vi.fn(), {} as any) as any;
        await slice.register('Ana', 'ana@ejemplo.com', 'clave-larga-123', null, '602bd2aa');
        expect(signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Ana', ref: '602bd2aa' });
    });

    it('sin enlace de afiliado, el alta es la de siempre', async () => {
        signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
        const slice = createAuthSlice(vi.fn(), vi.fn(), {} as any) as any;
        await slice.register('Ana', 'ana@ejemplo.com', 'clave-larga-123', null, null);
        expect(signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Ana' });
    });
});

describe('alta con Google: el código vuelve en la URL', () => {
    it('la URL de vuelta lleva el código solo si lo hay', () => {
        expect(urlDeVueltaConReferido('https://devfreelancer.app', '602bd2aa')).toBe('https://devfreelancer.app/?ref=602bd2aa');
        expect(urlDeVueltaConReferido('https://devfreelancer.app', null)).toBe('https://devfreelancer.app');
    });

    it('vincula el código con el servidor', async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        expect(await vincularReferido('602bd2aa')).toBe(true);
        expect(rpc).toHaveBeenCalledWith('vincular_referido', { p_codigo: '602bd2aa' });
    });

    it('si el servidor dice que no (ya vinculado, más de 7 días), da el asunto por cerrado', async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        expect(await vincularReferido('602bd2aa')).toBe(true);
    });

    it('si la llamada falla, lo indica para reintentar', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'sin red' } });
        expect(await vincularReferido('602bd2aa')).toBe(false);
    });
});

describe('sin almacenamiento en el navegador', () => {
    it('borra las claves que guardaban versiones anteriores', () => {
        localStorage.setItem('devfreelancer_ref', '602bd2aa');
        localStorage.setItem('df_cookie_consent', 'true');
        localStorage.setItem('df_cookie_prefs', '{}');
        localStorage.setItem('devfreelancer_active_timer', 'x');
        borrarClavesAntiguas();
        expect(localStorage.getItem('devfreelancer_ref')).toBeNull();
        expect(localStorage.getItem('df_cookie_consent')).toBeNull();
        expect(localStorage.getItem('df_cookie_prefs')).toBeNull();
        expect(localStorage.getItem('devfreelancer_active_timer')).toBe('x');
    });

    it('el registro ya no escribe el código en localStorage', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const fuente = readFileSync(resolve(__dirname, '../../lib/afiliados.ts'), 'utf8');
        expect(fuente).not.toMatch(/localStorage\.setItem/);
    });
});

describe('estadísticas de la página', () => {
    it('cuenta referidos, suscripciones activas y comisión total', () => {
        const r = estadisticasDeReferidos([
            { id: '1', referred_user_name: 'Lucía', join_date: null, status: 'Subscribed', commission_cents: 398 },
            { id: '2', referred_user_name: null, join_date: null, status: 'Registered', commission_cents: 0 },
            { id: '3', referred_user_name: 'Pepe', join_date: null, status: 'Cancelled', commission_cents: 199 },
        ]);
        expect(r).toEqual({ totalReferrals: 3, activeSubscriptions: 1, totalEarnings: 597 });
    });
});
