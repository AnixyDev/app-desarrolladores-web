// Diálogo de confirmación propio y borrado de clientes (06/10/2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useConfirmar, confirmar } from '@/hooks/useConfirmar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { borrarClienteConConfirmacion } from '@/lib/borrarCliente';
import type { Client, Invoice } from '@/types';

vi.mock('@/lib/descargaFacturas', () => ({
  zipDeFacturas: vi.fn(async () => ({ blob: new Blob(['zip']), sinCliente: [] })),
}));

const raiz = resolve(__dirname, '../..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Responde a la confirmación que esté abierta. */
const responder = (si: boolean) => act(() => useConfirmar.getState().responder(si));
const esperarDialogo = async () => {
  for (let i = 0; i < 20 && !useConfirmar.getState().abierto; i++) await new Promise((r) => setTimeout(r, 0));
  return useConfirmar.getState().abierto;
};

beforeEach(() => useConfirmar.setState({ abierto: null, resolver: null }));

describe('sin ventanas del navegador', () => {
  it('ninguna pantalla usa window.confirm', () => {
    const conConfirm = [...ficheros(join(raiz, 'pages')), ...ficheros(join(raiz, 'components'))]
      .filter((f) => /\bwindow\.confirm\s*\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => f.replace(raiz + '/', ''));
    expect(conConfirm).toEqual([]);
  });

  it('el diálogo está montado en App.tsx', () => {
    expect(readFileSync(join(raiz, 'App.tsx'), 'utf8')).toMatch(/<ConfirmDialog \/>/);
  });
});

describe('confirmar()', () => {
  it('devuelve true al aceptar y false al cancelar', async () => {
    const a = confirmar({ titulo: 'x' });
    responder(true);
    expect(await a).toBe(true);
    const b = confirmar({ titulo: 'y' });
    responder(false);
    expect(await b).toBe(false);
  });

  it('una confirmación nueva cancela la anterior: ninguna promesa se queda colgada', async () => {
    const primera = confirmar({ titulo: 'primera' });
    const segunda = confirmar({ titulo: 'segunda' });
    expect(await primera).toBe(false);
    responder(true);
    expect(await segunda).toBe(true);
  });
});

describe('<ConfirmDialog />', () => {
  it('muestra el texto, Escape cancela y el foco empieza en Cancelar si es peligroso', async () => {
    render(<ConfirmDialog />);
    let respuesta: Promise<boolean>;
    act(() => { respuesta = confirmar({ titulo: '¿Borrar X?', mensaje: 'No se puede deshacer.', peligro: true }); });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('¿Borrar X?')).toBeTruthy();
    expect(screen.getByText('Borrar')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Cancelar');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await respuesta!).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('el botón de confirmar resuelve true', async () => {
    render(<ConfirmDialog />);
    let respuesta: Promise<boolean>;
    act(() => { respuesta = confirmar({ titulo: '¿Seguir?', textoConfirmar: 'Sí, seguir' }); });
    fireEvent.click(screen.getByText('Sí, seguir'));
    expect(await respuesta!).toBe(true);
  });
});

describe('borrar un cliente', () => {
  const cliente = { id: 'c1', name: 'Acme' } as Client;
  const factura = { id: 'f1', client_id: 'c1', invoice_number: 'INV-2026-0001' } as Invoice;
  const base = () => ({
    cliente, proyectos: 2, perfil: { id: 'u' } as any, registrosFiscales: [], clientePorId: () => cliente,
    borrar: vi.fn(async () => {}), avisar: vi.fn(),
  });

  it('con facturas no se borra y se ofrece descargarlas', async () => {
    const d = { ...base(), facturas: [factura] };
    const r = borrarClienteConConfirmacion(d);
    const abierto = await esperarDialogo();
    expect(abierto?.titulo).toMatch(/no se puede borrar/);
    expect(abierto?.textoConfirmar).toBe('Descargar sus facturas');
    expect(abierto?.peligro).toBeFalsy();
    responder(false);
    expect(await r).toBe(false);
    expect(d.borrar).not.toHaveBeenCalled();
  });

  it('con facturas, aceptar descarga el ZIP y sigue sin borrar', async () => {
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const d = { ...base(), facturas: [factura] };
    const r = borrarClienteConConfirmacion(d);
    await esperarDialogo();
    responder(true);
    expect(await r).toBe(false);
    expect(crear).toHaveBeenCalled();
    expect(d.borrar).not.toHaveBeenCalled();
    expect(d.avisar).toHaveBeenCalledWith('Facturas descargadas.', 'success');
  });

  it('sin facturas: avisa de lo que se va con él y borra al confirmar', async () => {
    const d = { ...base(), facturas: [] };
    const r = borrarClienteConConfirmacion(d);
    const abierto = await esperarDialogo();
    expect(String(abierto?.mensaje)).toMatch(/2 proyectos/);
    expect(abierto?.peligro).toBe(true);
    responder(true);
    expect(await r).toBe(true);
    expect(d.borrar).toHaveBeenCalledWith('c1');
  });

  it('si la base de datos lo rechaza (DF001), lo dice y no lo da por borrado', async () => {
    const d = { ...base(), facturas: [], borrar: vi.fn(async () => { throw { code: 'DF001', message: 'Este cliente tiene 1 factura(s) emitida(s) y no se puede borrar: hay que conservarlas.' }; }) };
    const r = borrarClienteConConfirmacion(d);
    await esperarDialogo();
    responder(true);
    expect(await r).toBe(false);
    expect(d.avisar).toHaveBeenCalledWith(expect.stringMatching(/no se puede borrar/), 'error');
  });

  it('la ficha solo vuelve a la lista si el borrado se ha confirmado', () => {
    const src = sinComentarios(readFileSync(join(raiz, 'pages/ClientDetailPage.tsx'), 'utf8'));
    expect(src).toMatch(/if \(borrado\) navigate\('\/clients'\)/);
  });
});
