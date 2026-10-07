// Página de Garantías, exportación de datos y portada (06/10/2026).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GarantiasPage from '@/pages/legal/GarantiasPage';
import { csvGenerico, soloDeLaCuenta } from '@/lib/exportarDatos';
import { precioDe } from '../../supabase/functions/_shared/catalogo-stripe';

const raiz = resolve(__dirname, '../..');
const leer = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('exportar datos', () => {
  it('CSV con todas las columnas, comillas escapadas y objetos en JSON', () => {
    const csv = csvGenerico([{ a: 1, b: 'di "hola"' }, { a: 2, c: { x: 1 } }]);
    const [cab, f1, f2] = csv.replace('﻿', '').split('\r\n');
    expect(cab).toBe('"a";"b";"c"');
    expect(f1).toBe('"1";"di ""hola""";""');
    expect(f2).toBe('"2";"";"{""x"":1}"');
  });

  it('solo exporta lo de la cuenta', () => {
    const filas = [{ id: 1, user_id: 'yo' }, { id: 2, user_id: 'otro' }, { id: 3 }];
    expect(soloDeLaCuenta(filas, 'yo').map((f) => f.id)).toEqual([1, 3]);
  });

  it('está en Ajustes → Seguridad', () => {
    expect(leer('pages/SettingsPage.tsx')).toMatch(/<ExportarDatosCard \/>/);
  });
});

describe('garantías', () => {
  it('no declara que cumple Verifactu mientras falte la firma y el envío a la AEAT', () => {
    render(<MemoryRouter><GarantiasPage /></MemoryRouter>);
    expect(screen.getByText('Tus datos son tuyos')).toBeTruthy();
    expect(screen.getAllByText('En desarrollo').length).toBe(1);
    const texto = document.body.textContent ?? '';
    expect(texto).toMatch(/Se publicará en\s+esta página cuando esté firmada/);
    expect(texto).toMatch(/Agencia Tributaria real/);
  });

  it('la ruta existe y se enlaza desde el pie, la portada y Precios', () => {
    expect(leer('App.tsx')).toMatch(/path="\/garantias"/);
    for (const p of ['components/PieLegal.tsx', 'pages/LandingPage.tsx', 'pages/PricingPage.tsx']) {
      expect(leer(p)).toMatch(/to="\/garantias"/);
    }
  });
});

describe('portada', () => {
  it('no promete Verifactu y el precio del héroe estático coincide con el catálogo', () => {
    const html = leer('index.html');
    const landing = leer('pages/LandingPage.tsx');
    expect(landing).not.toMatch(/con Verifactu<|listo antes de julio/i);
    const precio = precioDe('proPlan')!.precio.replace('€', ' €');
    expect(html).toContain(`Pro, ${precio} al mes.`);
  });
});
