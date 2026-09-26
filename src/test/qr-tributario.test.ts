import { describe, it, expect } from 'vitest';
import {
    AEAT_QR_SERVICIO,
    QR_TRIBUTARIO_MM,
    construirUrlQrTributario,
    fechaParaQr,
} from '@/services/pdfService';

const base = {
    nif: 'B12345678',
    numeroFactura: 'INV-2026-0005',
    fechaEmision: '2026-09-26',
    totalCents: 181500,
};

describe('QR tributario de las facturas', () => {
    it('cada modalidad apunta a su propio servicio de cotejo', () => {
        const vf = new URL(construirUrlQrTributario({ ...base, modalidad: 'verifactu' }));
        const nvf = new URL(construirUrlQrTributario({ ...base, modalidad: 'no_verifactu' }));
        expect(vf.pathname.endsWith('/ValidarQR')).toBe(true);
        expect(nvf.pathname.endsWith('/ValidarQRNoVerifactu')).toBe(true);
        expect(AEAT_QR_SERVICIO.verifactu).not.toBe(AEAT_QR_SERVICIO.no_verifactu);
    });

    it('lleva los cuatro parámetros con el formato de la orden', () => {
        const u = new URL(construirUrlQrTributario({ ...base, modalidad: 'no_verifactu' }));
        expect(u.protocol).toBe('https:');
        expect(u.searchParams.get('nif')).toBe('B12345678');
        expect(u.searchParams.get('numserie')).toBe('INV-2026-0005');
        expect(u.searchParams.get('fecha')).toBe('26-09-2026');
        expect(u.searchParams.get('importe')).toBe('1815.00');
    });

    it('el importe usa punto decimal y dos decimales', () => {
        const importe = (c: number) =>
            new URL(construirUrlQrTributario({ ...base, totalCents: c, modalidad: 'verifactu' }))
                .searchParams.get('importe');
        expect(importe(0)).toBe('0.00');
        expect(importe(5)).toBe('0.05');
        expect(importe(12099)).toBe('120.99');
        expect(importe(-2500)).toBe('-25.00'); // factura rectificativa
    });

    it('la fecha no se desplaza de día por el huso horario', () => {
        expect(fechaParaQr('2026-09-26')).toBe('26-09-2026');
        expect(fechaParaQr('2026-01-01')).toBe('01-01-2026');
        expect(fechaParaQr('2026-12-31T23:30:00-05:00')).toBe('31-12-2026');
    });

    it('una fecha no válida falla en vez de imprimir un QR erróneo', () => {
        expect(() => fechaParaQr('')).toThrow();
        expect(() => fechaParaQr('26/09/2026')).toThrow();
    });

    it('caracteres especiales del número de factura se codifican', () => {
        const u = new URL(construirUrlQrTributario({ ...base, numeroFactura: 'A/2026 #1&2', modalidad: 'verifactu' }));
        expect(u.searchParams.get('numserie')).toBe('A/2026 #1&2');
    });

    it('el QR impreso mide entre 30 y 40 mm', () => {
        expect(QR_TRIBUTARIO_MM).toBeGreaterThanOrEqual(30);
        expect(QR_TRIBUTARIO_MM).toBeLessThanOrEqual(40);
    });
});
