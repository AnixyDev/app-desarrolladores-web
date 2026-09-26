import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Restablecer contraseña no llegaba nunca al formulario (visto en los
 * registros de Auth del 26/09):
 *  1. La app pedía volver a la URL interna del despliegue de Vercel
 *     (app-desarrolladores-xxxx.vercel.app). Supabase la rechazaba y mandaba
 *     a la portada de devfreelancer.app, sin formulario.
 *  2. Con el enlace PKCE (`?code=`), pedirlo en el ordenador y abrirlo en el
 *     móvil no puede funcionar: el verificador vive en el navegador que lo pidió.
 */

const auth = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    verifyOtp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
    supabase: { auth },
    getURL: () => window.location.origin,
}));

import ResetPasswordPage, { leerTokenDeRecuperacion } from '../../pages/auth/ResetPasswordPage';
import ForgotPasswordPage from '../../pages/auth/ForgotPasswordPage';
import { debeIrARestablecer, RUTA_RESTABLECER } from '../../hooks/store/authSlice';

const irA = (ruta: string) => window.history.replaceState({}, '', ruta);

beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

afterEach(() => irA('/'));

describe('getURL — la dirección de vuelta del correo', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('es la de la página, aunque exista VITE_VERCEL_URL', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://ejemplo.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-falsa');
        vi.stubEnv('VITE_VERCEL_URL', 'app-desarrolladores-a48e671gq-anixydevs.vercel.app');
        const real = await vi.importActual<typeof import('../../lib/supabaseClient')>('../../lib/supabaseClient');
        expect(real.getURL()).toBe(window.location.origin);
        expect(real.getURL()).not.toContain('vercel.app');
    });
});

describe('recuperar contraseña pide volver a la página correcta', () => {
    it('redirectTo = origen de la página + /auth/reset-password', async () => {
        render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@ejemplo.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));
        await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1));
        const [, opciones] = auth.resetPasswordForEmail.mock.calls[0];
        expect(opciones.redirectTo).toBe(`${window.location.origin}/auth/reset-password`);
    });
});

describe('enlace con token_hash (funciona en cualquier dispositivo)', () => {
    it('lee el token solo si es de recuperación', () => {
        expect(leerTokenDeRecuperacion('?token_hash=abc&type=recovery')).toBe('abc');
        expect(leerTokenDeRecuperacion('?token_hash=abc&type=magiclink')).toBeNull();
        expect(leerTokenDeRecuperacion('?code=xyz')).toBeNull();
        expect(leerTokenDeRecuperacion('')).toBeNull();
    });

    it('verifica el token, enseña el formulario y limpia la URL', async () => {
        irA('/auth/reset-password?token_hash=tok-1&type=recovery');
        render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
        expect(await screen.findByText('Elige una nueva contraseña')).toBeInTheDocument();
        expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
        expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok-1', type: 'recovery' });
        expect(window.location.search).toBe('');
    });

    it('no gasta el mismo token dos veces si la página se monta de nuevo', async () => {
        irA('/auth/reset-password?token_hash=tok-2&type=recovery');
        const { unmount } = render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
        await screen.findByText('Elige una nueva contraseña');
        unmount();
        irA('/auth/reset-password?token_hash=tok-2&type=recovery');
        auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
        render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
        await screen.findByText('Elige una nueva contraseña');
        expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    });

    it('token caducado y sin sesión: "Enlace no válido"', async () => {
        irA('/auth/reset-password?token_hash=tok-3&type=recovery');
        auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });
        render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
        expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
    });
});

describe('red de seguridad: enlace de recuperación fuera de su página', () => {
    it('desde la portada o el login hay que ir al formulario', () => {
        expect(debeIrARestablecer('/')).toBe(true);
        expect(debeIrARestablecer('/auth/login')).toBe(true);
    });

    it('en la propia página, no (si no, bucle)', () => {
        expect(debeIrARestablecer(RUTA_RESTABLECER)).toBe(false);
        expect(debeIrARestablecer(RUTA_RESTABLECER + '/')).toBe(false);
    });
});
