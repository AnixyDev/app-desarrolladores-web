import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// El componente solo pinta lo que dice el servidor: se simula la respuesta.
const obtenerPlazasFundadores = vi.fn();
vi.mock('@/services/stripeService', () => ({ obtenerPlazasFundadores: () => obtenerPlazasFundadores() }));

import OfertaFundadores from '../../components/OfertaFundadores';

const abierta = { total: 50, restantes: 37, disponible: true, cierre: '2026-12-31T23:00:00.000Z' };

describe('OfertaFundadores', () => {
  beforeEach(() => obtenerPlazasFundadores.mockReset());

  it('muestra el contador real y la fecha de cierre que da el servidor', async () => {
    obtenerPlazasFundadores.mockResolvedValue(abierta);
    render(<OfertaFundadores textoBoton="Quiero mi plaza" onElegir={() => {}} />);
    expect(await screen.findByText('Quedan 37 de 50 plazas')).toBeTruthy();
    expect(screen.getByText(/hasta el 31\/12\/2026/)).toBeTruthy();
    expect(screen.getByText(/59€\/año/)).toBeTruthy();
  });

  it('el botón llama a la acción', async () => {
    obtenerPlazasFundadores.mockResolvedValue(abierta);
    const onElegir = vi.fn();
    render(<OfertaFundadores textoBoton="Quiero mi plaza" onElegir={onElegir} />);
    fireEvent.click(await screen.findByText('Quiero mi plaza'));
    expect(onElegir).toHaveBeenCalledOnce();
  });

  it.each([
    ['sin plazas', { ...abierta, restantes: 0, disponible: false }],
    ['oferta cerrada', { ...abierta, disponible: false }],
    ['el servidor falla', null],
  ])('no muestra nada si %s', async (_caso, respuesta) => {
    obtenerPlazasFundadores.mockResolvedValue(respuesta);
    const { container } = render(<OfertaFundadores textoBoton="Quiero mi plaza" onElegir={() => {}} />);
    await waitFor(() => expect(obtenerPlazasFundadores).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText(/Quedan/)).toBeNull();
  });
});
