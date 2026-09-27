import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useOutletContext } from 'react-router-dom';

/**
 * Desde julio, /portal/login era una pantalla negra para cualquier cliente
 * sin sesión: el login cuelga de PortalLayout, y PortalLayout redirigía a
 * /portal/login a quien no tuviera sesión — también estando ya ahí. Nunca se
 * pintaba el formulario. Y es justo a donde manda el correo de invitación.
 *
 * Estos tests montan el layout con las mismas rutas que App.tsx.
 */

const sesion = { current: null as null | { user: { id: string } } };
const FICHA_UNICA = [{ client_id: 'c1', client_name: 'Cliente', owner_business_name: 'Estudio' }];
const fichasRpc = { current: FICHA_UNICA as Array<Record<string, string>> };
const clienteDelDocumento = { current: 'c1' };

vi.mock('@/lib/supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(() => Promise.resolve({ data: { session: sesion.current }, error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn(),
            signInWithOtp: vi.fn(),
        },
        rpc: vi.fn(() => Promise.resolve({ data: fichasRpc.current, error: null })),
        from: vi.fn(() => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { client_id: clienteDelDocumento.current }, error: null }),
                }),
            }),
        })),
    },
}));

import PortalLayout, { esRutaDeLoginDelPortal } from '../../pages/portal/PortalLayout';
import PortalLoginPage from '../../pages/portal/PortalLoginPage';
import { destinoValido, loginConDestino, guardarDestino, recogerDestino } from '../../lib/destinoPortal';

const DondeEstoy = () => {
    const l = useLocation();
    return <div data-testid="ruta">{l.pathname}</div>;
};
const Contrato = () => {
    const { clientId } = useOutletContext<{ clientId?: string }>();
    return <div>Contrato para firmar <span data-testid="ficha">{clientId}</span></div>;
};
const Consulta = () => <div data-testid="consulta">{useLocation().search}</div>;

const montar = (ruta: string) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route path="/portal" element={<PortalLayout />}>
                    <Route path="login" element={<PortalLoginPage />} />
                    <Route path="dashboard" element={<div>Panel del cliente</div>} />
                    <Route path="contracts/:contractId" element={<Contrato />} />
                </Route>
            </Routes>
            <DondeEstoy />
            <Consulta />
        </MemoryRouter>
    );

beforeEach(() => {
    sesion.current = null;
    fichasRpc.current = FICHA_UNICA;
    clienteDelDocumento.current = 'c1';
    localStorage.clear();
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

describe('el enlace de un contrato (correo del 27/09: acababa en el login y no en el contrato)', () => {
    it('sin sesión: al login con el email puesto y recordando el contrato', async () => {
        montar('/portal/contracts/k1?email=virginia@ejemplo.com');
        expect(await screen.findByDisplayValue('virginia@ejemplo.com')).toBeInTheDocument();
        expect(screen.getByTestId('ruta')).toHaveTextContent('/portal/login');
        expect(screen.getByTestId('consulta').textContent).toContain('next=%2Fportal%2Fcontracts%2Fk1');
        expect(screen.getByText(/Al abrirlo irás directamente a él/)).toBeInTheDocument();
    });

    it('al volver del enlace mágico (aterriza en /portal) va al contrato', async () => {
        guardarDestino('/portal/contracts/k1');
        sesion.current = { user: { id: 'u1' } };
        montar('/portal');
        expect(await screen.findByText(/Contrato para firmar/)).toBeInTheDocument();
        expect(screen.getByTestId('ruta')).toHaveTextContent('/portal/contracts/k1');
    });

    it('con sesión ya abierta, el login con ?next= lleva al contrato', async () => {
        sesion.current = { user: { id: 'u1' } };
        montar('/portal/login?next=%2Fportal%2Fcontracts%2Fk1');
        expect(await screen.findByText(/Contrato para firmar/)).toBeInTheDocument();
    });

    it('con sesión, el enlace del contrato abre el contrato directamente', async () => {
        sesion.current = { user: { id: 'u1' } };
        montar('/portal/contracts/k1?email=virginia@ejemplo.com');
        expect(await screen.findByText(/Contrato para firmar/)).toBeInTheDocument();
    });
});

describe('cliente de varios freelancers (27/09: el portal solo enlazaba una ficha)', () => {
    const DOS = [
        { client_id: 'c1', client_name: 'Ana', owner_business_name: 'Estudio Uno' },
        { client_id: 'c2', client_name: 'Virginia', owner_business_name: 'Anixy Dev' },
    ];

    it('el enlace de un contrato abre la ficha a la que pertenece', async () => {
        fichasRpc.current = DOS;
        clienteDelDocumento.current = 'c2';
        sesion.current = { user: { id: 'u1' } };
        montar('/portal/contracts/k2');
        expect(await screen.findByText(/Contrato para firmar/)).toBeInTheDocument();
        expect(screen.getByTestId('ficha')).toHaveTextContent('c2');
        expect(screen.getByRole('combobox', { name: 'Cambiar de freelancer' })).toHaveValue('c2');
    });

    it('con una sola ficha no hay selector', async () => {
        sesion.current = { user: { id: 'u1' } };
        montar('/portal/contracts/k1');
        expect(await screen.findByText(/Contrato para firmar/)).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Cambiar de freelancer' })).not.toBeInTheDocument();
    });
});

describe('destino tras el login', () => {
    it('solo acepta páginas del portal', () => {
        expect(destinoValido('/portal/contracts/0d0fc11a-1b66-47fd-a50f-3fabee334197')).toBe('/portal/contracts/0d0fc11a-1b66-47fd-a50f-3fabee334197');
        expect(destinoValido('https://malo.com/portal/x')).toBeNull();
        expect(destinoValido('//malo.com')).toBeNull();
        expect(destinoValido('/portal//malo.com')).toBeNull();
        expect(destinoValido('/\\malo.com')).toBeNull();
        expect(destinoValido('/portal/login')).toBeNull();
        expect(destinoValido('/dashboard')).toBeNull();
        expect(destinoValido(null)).toBeNull();
    });

    it('se usa una vez y caduca', () => {
        guardarDestino('/portal/contracts/k1');
        expect(recogerDestino()).toBe('/portal/contracts/k1');
        expect(recogerDestino()).toBeNull();
        localStorage.setItem('portal:destino', JSON.stringify({ destino: '/portal/contracts/k1', hasta: Date.now() - 1 }));
        expect(recogerDestino()).toBeNull();
    });

    it('arma la dirección del login', () => {
        expect(loginConDestino('/portal/dashboard')).toBe('/portal/login');
        expect(loginConDestino('/portal/contracts/k1', 'a@b.com')).toBe('/portal/login?next=%2Fportal%2Fcontracts%2Fk1&email=a%40b.com');
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
