import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LOOKUP_KEY_FUNDADORES as CLAVE_COPIA, estadoSuscripcion, operacionesPara, type SuscripcionStripe } from '../../supabase/functions/_shared/cancelacion';
import { LOOKUP_KEY_FUNDADORES } from '../../supabase/functions/_shared/fundadores';

const sub = (o: Partial<SuscripcionStripe> = {}): SuscripcionStripe => ({
  id: 'sub_1', status: 'active', cancel_at_period_end: false, current_period_end: 1798761600,
  items: { data: [{ price: { lookup_key: 'pro_anual', recurring: { interval: 'year' } } }] }, ...o,
});

describe('cancelación: lógica del servidor', () => {
  it('usa la misma clave del Plan Fundadores que fundadores.ts', () => {
    expect(CLAVE_COPIA).toBe(LOOKUP_KEY_FUNDADORES);
  });

  it('estado: periodo, programada y fundadores', () => {
    expect(estadoSuscripcion([])).toMatchObject({ tieneSuscripcion: false });
    const e = estadoSuscripcion([sub({ items: { data: [{ price: { lookup_key: 'pro_anual_fundadores', recurring: { interval: 'year' } } }] } })]);
    expect(e).toMatchObject({ tieneSuscripcion: true, cancelacionProgramada: false, esFundadores: true, intervalo: 'year' });
    expect(e.finPeriodo).toBe(new Date(1798761600 * 1000).toISOString());
    expect(estadoSuscripcion([sub({ cancel_at_period_end: true })]).cancelacionProgramada).toBe(true);
  });

  it('ignora las suscripciones ya canceladas o caducadas', () => {
    expect(estadoSuscripcion([sub({ status: 'canceled' }), sub({ status: 'incomplete_expired' })]).tieneSuscripcion).toBe(false);
  });

  it('al final del periodo: marca cancel_at_period_end en las vivas que no lo tienen', () => {
    expect(operacionesPara('al_final', [sub(), sub({ id: 'sub_2', cancel_at_period_end: true }), sub({ id: 'sub_3', status: 'canceled' })]))
      .toEqual([{ tipo: 'actualizar', id: 'sub_1', cancel_at_period_end: true }]);
  });

  it('ahora: cancela todas las vivas', () => {
    expect(operacionesPara('ahora', [sub(), sub({ id: 'sub_2', status: 'past_due' }), sub({ id: 'x', status: 'canceled' })]))
      .toEqual([{ tipo: 'cancelar', id: 'sub_1' }, { tipo: 'cancelar', id: 'sub_2' }]);
  });

  it('reanudar: solo deshace lo programado; estado no hace nada', () => {
    expect(operacionesPara('reanudar', [sub({ cancel_at_period_end: true }), sub({ id: 'sub_2' })]))
      .toEqual([{ tipo: 'actualizar', id: 'sub_1', cancel_at_period_end: false }]);
    expect(operacionesPara('estado', [sub()])).toEqual([]);
  });
});

const gestionar = vi.fn();
vi.mock('@/services/stripeService', () => ({ gestionarCancelacion: (a: string) => gestionar(a) }));
import CancelarSuscripcion from '../../components/CancelarSuscripcion';

const ESTADO = { tieneSuscripcion: true, cancelacionProgramada: false, finPeriodo: '2026-12-31T00:00:00.000Z', esFundadores: false, intervalo: 'year' };

describe('tarjeta de cancelación', () => {
  beforeEach(() => gestionar.mockReset());

  it('sin suscripción no se muestra', async () => {
    gestionar.mockResolvedValue({ ...ESTADO, tieneSuscripcion: false });
    const { container } = render(<CancelarSuscripcion />);
    await waitFor(() => expect(gestionar).toHaveBeenCalledWith('estado'));
    expect(container.textContent).toBe('');
  });

  it('ofrece las dos opciones y cancela al final del periodo por defecto', async () => {
    gestionar.mockResolvedValueOnce(ESTADO).mockResolvedValueOnce({ ...ESTADO, cancelacionProgramada: true });
    const onCambio = vi.fn();
    render(<CancelarSuscripcion onCambio={onCambio} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar suscripción' }));
    expect(screen.getByRole('radio', { name: /Al final del periodo pagado/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Ahora mismo/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar al final del periodo' }));
    await waitFor(() => expect(gestionar).toHaveBeenLastCalledWith('al_final'));
    expect(await screen.findByRole('button', { name: 'Reanudar suscripción' })).toBeInTheDocument();
    expect(onCambio).toHaveBeenCalled();
  });

  it('puede cancelar en el momento', async () => {
    gestionar.mockResolvedValueOnce(ESTADO).mockResolvedValueOnce({ ...ESTADO, tieneSuscripcion: false });
    render(<CancelarSuscripcion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar suscripción' }));
    fireEvent.click(screen.getByRole('radio', { name: /Ahora mismo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar ahora' }));
    await waitFor(() => expect(gestionar).toHaveBeenLastCalledWith('ahora'));
  });

  it('avisa de que se pierde el precio de fundador', async () => {
    gestionar.mockResolvedValue({ ...ESTADO, esFundadores: true });
    render(<CancelarSuscripcion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar suscripción' }));
    expect(screen.getByText(/pierdes el precio de fundador/)).toBeInTheDocument();
  });

  it('con la cancelación programada permite reanudar', async () => {
    gestionar.mockResolvedValueOnce({ ...ESTADO, cancelacionProgramada: true }).mockResolvedValueOnce(ESTADO);
    render(<CancelarSuscripcion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reanudar suscripción' }));
    await waitFor(() => expect(gestionar).toHaveBeenLastCalledWith('reanudar'));
  });
});
