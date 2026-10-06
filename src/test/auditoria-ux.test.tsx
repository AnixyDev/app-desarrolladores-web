// Auditoría UX/UI del 06/10/2026: lo que no debe volver.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Input from '@/components/ui/Input';

const raiz = resolve(__dirname, '../..');
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}
const pantallas = () => [...ficheros(join(raiz, 'pages')), ...ficheros(join(raiz, 'components'))];

describe('auditoría UX', () => {
  it('<Input label> asocia la etiqueta al campo aunque no se pase id', () => {
    render(<Input label="Fecha emisión" type="date" />);
    expect(screen.getByLabelText('Fecha emisión')).toBeTruthy();
  });

  it('ningún texto por debajo de 12 px', () => {
    const conTextoMinimo = pantallas()
      .filter((f) => /text-\[(?:[0-9]|1[01])px\]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(raiz + '/', ''));
    expect(conTextoMinimo).toEqual([]);
  });

  it('el gris secundario cumple el contraste 4,5:1', () => {
    expect(readFileSync(join(raiz, 'tailwind.config.js'), 'utf8')).toMatch(/500:\s*'#838b99'/);
  });

  it('Precios y Facturación no prometen On-Premise', () => {
    for (const p of ['pages/PricingPage.tsx', 'pages/BillingPage.tsx']) {
      const src = readFileSync(join(raiz, p), 'utf8');
      expect(src).not.toMatch(/On-Premise|Hablar con ventas/);
      expect(src).toMatch(/escríbenos y lo estudiamos/);
    }
  });
});
