import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const redirectToCheckoutFundadores = vi.fn().mockResolvedValue(undefined);
const addToast = vi.fn();
let plan = 'Free';

vi.mock('@/services/stripeService', () => ({
  redirectToCheckout: vi.fn(),
  redirectToCustomerPortal: vi.fn(),
  redirectToCheckoutFundadores: () => redirectToCheckoutFundadores(),
  obtenerPlazasFundadores: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/hooks/useAppStore', () => ({
  useAppStore: (sel: (s: any) => any) =>
    sel({ profile: { plan }, refreshProfile: vi.fn(), fetchJobs: vi.fn() }),
}));

import BillingPage from '../../pages/BillingPage';
import { guardarIntencionFundadores, hayIntencionFundadores } from '../../lib/intencionFundadores';

const montar = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/billing" element={<BillingPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('BillingPage con ?oferta=fundadores', () => {
  beforeEach(() => {
    redirectToCheckoutFundadores.mockClear();
    addToast.mockClear();
    localStorage.clear();
    plan = 'Free';
  });

  it('sin plan de pago: abre el pago una sola vez y olvida la intención', async () => {
    guardarIntencionFundadores();
    montar('/billing?oferta=fundadores');
    await waitFor(() => expect(redirectToCheckoutFundadores).toHaveBeenCalledTimes(1));
    expect(hayIntencionFundadores()).toBe(false);
  });

  it('con plan de pago: no abre el pago y lo explica', async () => {
    plan = 'Pro';
    montar('/billing?oferta=fundadores');
    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(redirectToCheckoutFundadores).not.toHaveBeenCalled();
    expect(addToast.mock.calls[0][0]).toMatch(/solo para nuevas suscripciones/);
  });

  it('sin la oferta en la URL no abre ningún pago', async () => {
    montar('/billing');
    await new Promise((r) => setTimeout(r, 50));
    expect(redirectToCheckoutFundadores).not.toHaveBeenCalled();
  });
});
