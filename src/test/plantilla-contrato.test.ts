import { describe, it, expect } from 'vitest';
import { generarContrato, huecosPendientes, fechaEnLetra } from '../../lib/plantillaContrato';
import { generateContractPdfBase64 } from '../../services/pdfService';

const completo = {
    freelancer: { nombre: 'Ana Fernández Rodríguez', negocio: 'Anixy {Dev}', nif: '12345678Z', domicilio: 'C/ Larios 1, 29005 Málaga, Málaga', email: 'ana@ejemplo.com' },
    cliente: { nombre: 'Virginia López', empresa: 'Tiendas VL S.L.', nif: 'B12345678', domicilio: 'Av. Andalucía 3, Málaga', email: 'virginia@ejemplo.com' },
    proyecto: { nombre: 'Tienda online', descripcion: 'Tienda online con pasarela de pago', fechaEntrega: '2026-12-15', importeCents: 320000 },
    lugar: 'Málaga',
    fecha: '2026-09-28',
};

describe('plantilla de contrato (ley española)', () => {
    const texto = generarContrato(completo);

    it('con todos los datos no deja huecos', () => {
        expect(huecosPendientes(texto)).toBe(0);
    });

    it('recoge partes, objeto, precio y fechas', () => {
        expect(texto).toContain('En Málaga, a 28 de septiembre de 2026.');
        expect(texto).toContain('Ana Fernández Rodríguez, con NIF 12345678Z');
        expect(texto).toContain('en nombre y representación de Tiendas VL S.L.');
        expect(texto).toContain('«Tienda online»');
        expect(texto).toContain('15 de diciembre de 2026');
        expect(texto).toMatch(/3\.?200,00\s€, impuestos no incluidos/);
    });

    it('incluye las cláusulas que exige o recomienda la ley', () => {
        for (const clave of [
            'Ley 3/2004',                       // morosidad: demora BCE + 8 y 40 €
            'más ocho puntos porcentuales',
            '40 euros',
            'Ley de Propiedad Intelectual',     // cesión por escrito con alcance
            'para todo el mundo y durante todo el tiempo de protección legal',
            'artículo 28 del RGPD',              // encargado del tratamiento
            'Ley 20/2007',                      // relación mercantil, no laboral
            'catorce (14) días naturales',      // desistimiento del consumidor
            'eIDAS',                            // firma electrónica
            'se rige por la ley española',
        ]) expect(texto).toContain(clave);
    });

    it('sin datos: marca los huecos para rellenar', () => {
        const t = generarContrato({ ...completo, freelancer: { nombre: 'Ana' }, cliente: { nombre: 'Cliente' }, lugar: null });
        expect(huecosPendientes(t)).toBeGreaterThanOrEqual(6);
    });

    it('fechas en letra sin desfase de huso', () => {
        expect(fechaEnLetra('2026-01-01')).toBe('1 de enero de 2026');
        expect(fechaEnLetra(null)).toBe('[________]');
    });

    it('el PDF ya no se corta: ocupa varias páginas', () => {
        const b64 = generateContractPdfBase64({ id: 'k', user_id: 'u', client_id: 'c', project_id: 'p', content: texto, status: 'draft', created_at: '' });
        const pdf = atob(b64);
        const paginas = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
        expect(paginas).toBeGreaterThanOrEqual(3);
    });
});
