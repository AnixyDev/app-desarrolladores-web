import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/**
 * Desde julio, /portal/login era una pantalla negra para cualquier cliente
 * sin sesión: el login cuelga de PortalLayout, y PortalLayout redirigía a
 * /portal/login a quien no tuviera sesión — también estando ya ahí. Nunca se
 * pintaba el formulario. Y es justo a donde manda el correo de invitación.
 *
 * Estos tests montan el layout con las mismas rutas que App.tsx.
 */

const sesion = { current: null as null | { user: { id: string } } };

vi.mock('@/lib/supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(() => Promise.resolve({ data: { session: sesion.current }, error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn(),
            signInWithOtp: vi.fn(),
        },
        rpc: vi.fn(() =>
            Promise.resolve({
                data: [{ client_id: 'c1', client_name: 'Cliente', owner_business_name: 'Estudio' }],
                error: null,
            })
        ),
    },
}));

import PortalLayout, { esRutaDeLoginDelPortal } from '../../pages/portal/PortalLayout';
import PortalLoginPage from '../../pages/portal/PortalLoginPage';

const DondeEstoy = () => <div data-testid="ruta">{useLocation().pathname}</div>;

const montar = (ruta: string) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route path="/portal" element={<PortalLayout />}>
                    <Route path="login" element={<PortalLoginPage />} />
                    <Route path="dashboard" element={<div>Panel del cliente</div>} />
                </Route>
            </Routes>
            <DondeEstoy />
        </MemoryRouter>
    );

beforeEach(() => {
    sesion.current = null;
});

describe('sin sesión', () => {
    it('/portal/login pinta el formulario (antes: pantalla negra)', async () => {
        montar('/portal/login');
        expect(await screen.findByText('Acceso al Portal')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Enviar enlace de acceso/ })).toBeInTheDocument();
    });

    it('el enlace del correo de invitación, con ?email=, también', async () => {
        montar('/portal/login?email=cliente@ejemplo.com');
        expect(await screen.findByDisplayValue('cliente@ejemplo.com')).toBeInTheDocument();
    });

    it('cualquier otra página del portal manda al login', async () => {
        montar('/portal/dashboard');
        expect(await screen.findByText('Acceso al Portal')).toBeInTheDocument();
        expect(screen.getByTestId('ruta')).toHaveTextContent('/portal/login');
        expect(screen.queryByText('Panel del cliente')).not.toBeInTheDocument();
    });
});

describe('con sesión', () => {
    it('/portal/login lleva al panel', async () => {
        sesion.current = { user: { id: 'u1' } };
        montar('/portal/login');
        expect(await screen.findByText('Panel del cliente')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/portal/dashboard'));
    });
});

describe('esRutaDeLoginDelPortal', () => {
    it('reconoce la ruta con y sin barra final', () => {
        expect(esRutaDeLoginDelPortal('/portal/login')).toBe(true);
        expect(esRutaDeLoginDelPortal('/portal/login/')).toBe(true);
    });

    it('no confunde otras', () => {
        expect(esRutaDeLoginDelPortal('/portal')).toBe(false);
        expect(esRutaDeLoginDelPortal('/portal/dashboard')).toBe(false);
        expect(esRutaDeLoginDelPortal('/auth/login')).toBe(false);
    });
});
