import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  RUTA_PAGO_FUNDADORES,
  borrarIntencionFundadores,
  guardarIntencionFundadores,
  hayIntencionFundadores,
  pideFundadores,
} from '../../lib/intencionFundadores';
import AlEntrarConOferta from '../../components/AlEntrarConOferta';

const HORA = 60 * 60 * 1000;

describe('intención de pagar el Plan Fundadores', () => {
  beforeEach(() => localStorage.clear());

  it('reconoce el enlace ?oferta=fundadores', () => {
    expect(pideFundadores('?oferta=fundadores')).toBe(true);
    expect(pideFundadores('?ref=abc&oferta=fundadores')).toBe(true);
    expect(pideFundadores('?oferta=otra')).toBe(false);
    expect(pideFundadores('')).toBe(false);
  });

  it('se recuerda hasta 48 h y después caduca', () => {
    const t = Date.now();
    guardarIntencionFundadores(t);
    expect(hayIntencionFundadores(t + 47 * HORA)).toBe(true);
    expect(hayIntencionFundadores(t + 49 * HORA)).toBe(false);
    // Al caducar se borra.
    expect(hayIntencionFundadores(t)).toBe(false);
  });

  it('se puede borrar', () => {
    guardarIntencionFundadores();
    borrarIntencionFundadores();
    expect(hayIntencionFundadores()).toBe(false);
  });

  it('la ruta de pago apunta a facturación con la oferta', () => {
    expect(RUTA_PAGO_FUNDADORES).toBe('/billing?oferta=fundadores');
  });
});

const DondeEstoy = () => {
  const l = useLocation();
  return <p data-testid="ruta">{l.pathname + l.search}</p>;
};

const montar = (inicio: string) =>
  render(
    <MemoryRouter initialEntries={[inicio]}>
      <AlEntrarConOferta />
      <Routes>
        <Route path="*" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );

describe('AlEntrarConOferta', () => {
  beforeEach(() => localStorage.clear());

  it('al entrar con la intención guardada, lleva al pago de fundadores', async () => {
    guardarIntencionFundadores();
    montar('/dashboard');
    expect((await screen.findByTestId('ruta')).textContent).toBe('/billing?oferta=fundadores');
  });

  it('sin intención, no mueve a nadie', async () => {
    montar('/dashboard');
    expect((await screen.findByTestId('ruta')).textContent).toBe('/dashboard');
  });

  it('en facturación no redirige (allí se usa y se borra)', async () => {
    guardarIntencionFundadores();
    montar('/billing?payment=cancelled');
    expect((await screen.findByTestId('ruta')).textContent).toBe('/billing?payment=cancelled');
  });
});
