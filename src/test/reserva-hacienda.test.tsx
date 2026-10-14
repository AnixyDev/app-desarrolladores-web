import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Estado de la app simulado: dos facturas (3T y 4T) y un gasto.
const estado = {
  profile: { id: 'u1', tax_id: '12345678Z' },
  invoices: [
    { issue_date: '2026-08-01', subtotal_cents: 300000, tax_percent: 21, irpf_percent: 0, motivo_sin_iva: null },
    { issue_date: '2026-10-05', subtotal_cents: 100000, tax_percent: 21, irpf_percent: 0, motivo_sin_iva: null },
  ],
  expenses: [{ date: '2026-08-02', amount_cents: 100000, tax_percent: 21 }],
};
vi.mock('@/hooks/useAppStore', () => ({ useAppStore: (sel: (s: typeof estado) => unknown) => sel(estado) }));

import ReservaHaciendaCard from '../../components/dashboard/ReservaHaciendaCard';
import { Borrador303 } from '../../components/fiscal/BorradoresModelos';
import { modelo303, plazoTrimestre } from '../../lib/modelosTrimestrales';

const pintar = () => render(<MemoryRouter><ReservaHaciendaCard /></MemoryRouter>);

describe('Reserva para Hacienda (Inicio)', () => {
  afterEach(() => vi.useRealTimers());

  it('dentro del plazo del 3T avisa de lo que toca presentar y enlaza a sus casillas', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 12));
    pintar();
    expect(screen.getByText('Toca presentar el 3T 2026')).toBeTruthy();
    expect(screen.getByText(/Plazo hasta el 20\/10\/2026/)).toBeTruthy();
    expect(screen.getByText('Aparta para el 4T 2026 (hasta hoy)')).toBeTruthy();
    expect(screen.getByText('Ver casillas').getAttribute('href')).toBe('/tax-ledger?anio=2026&trimestre=3');
  });

  it('pasado el plazo solo enseña el trimestre en curso', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 12));
    pintar();
    expect(screen.queryByText(/Toca presentar/)).toBeNull();
    expect(screen.getByText('Ver borradores →').getAttribute('href')).toBe('/tax-ledger?anio=2026&trimestre=4');
  });
});

describe('Borrador del 303', () => {
  it('enseña las casillas y el resultado a ingresar', () => {
    const m = modelo303(estado.invoices as any, estado.expenses as any, 2026, 3);
    render(<Borrador303 m={m} plazo={plazoTrimestre(2026, 3)} />);
    expect(screen.getByText('Modelo 303 · IVA del 3T 2026')).toBeTruthy();
    expect(screen.getByLabelText('Copiar el importe de la casilla 07')).toBeTruthy();
    expect(screen.getByLabelText('Copiar el importe de la casilla 71')).toBeTruthy();
    expect(screen.getByText('A ingresar')).toBeTruthy();
  });
});
