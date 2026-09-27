import { describe, it, expect } from 'vitest';
import { formatearFecha, formatearFechaHora } from '../../lib/utils';

/**
 * Las fechas se enseñaban con toLocaleDateString() sin idioma: en un navegador
 * en inglés salía "9/27/2026". Y las columnas date ("2026-09-27") pasaban por
 * new Date(), que en husos negativos daba el día anterior.
 */
describe('formatearFecha', () => {
    it('columna date: día/mes/año sin desplazarse de día', () => {
        expect(formatearFecha('2026-09-27')).toBe('27/09/2026');
        expect(formatearFecha('2026-01-01')).toBe('01/01/2026');
    });

    it('fecha con hora: en formato español', () => {
        expect(formatearFecha('2026-09-27T12:00:00Z')).toBe('27/09/2026');
        expect(formatearFecha(new Date(2026, 8, 27))).toBe('27/09/2026');
    });

    it.each([null, undefined, '', 'no es una fecha'])('vacío o no válido: guion (%s)', v =>
        expect(formatearFecha(v as any)).toBe('—'));
});

describe('formatearFechaHora', () => {
    it('incluye la hora en formato de 24 h', () => {
        const t = formatearFechaHora(new Date(2026, 8, 27, 15, 40));
        expect(t).toMatch(/^27\/09\/2026,? 15:40$/);
    });
    it('vacío: guion', () => expect(formatearFechaHora(null)).toBe('—'));
});
