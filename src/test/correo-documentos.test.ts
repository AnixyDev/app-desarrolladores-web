import { describe, it, expect } from 'vitest';
import {
    escaparHtml, nombreDelRemitente, esPdfEnBase64, nombreDeArchivo,
    correoDeFactura, correoDeContrato,
} from '../../supabase/functions/_shared/correo-documentos';

/**
 * send-document-email ya no acepta destinatario, asunto ni HTML del navegador:
 * era un relé de correo con el dominio de la casa (bastaba con crear un
 * cliente con cualquier email). El correo lo redacta el servidor con estas
 * plantillas.
 */
describe('remitente', () => {
    it('siempre dice "vía DevFreelancer": nadie puede firmar como otra entidad a secas', () => {
        expect(nombreDelRemitente('Agencia Tributaria')).toBe('Agencia Tributaria vía DevFreelancer');
    });
    it('quita caracteres que romperían la cabecera From', () => {
        expect(nombreDelRemitente('Evil <x@y.com>\r\nBcc: a@b.c')).not.toMatch(/[<>\r\n]/);
    });
    it('sin nombre: un genérico', () => {
        expect(nombreDelRemitente('')).toBe('Tu freelancer vía DevFreelancer');
    });
});

describe('adjunto', () => {
    it('solo acepta PDF de verdad', () => {
        expect(esPdfEnBase64(btoa('%PDF-1.7 ...'))).toBe(true);
        expect(esPdfEnBase64(btoa('<html>'))).toBe(false);
        expect(esPdfEnBase64(undefined)).toBe(false);
    });
    it('nombre de archivo seguro', () => {
        expect(nombreDeArchivo('Factura', 'INV-2026-0005')).toBe('Factura-INV-2026-0005.pdf');
        expect(nombreDeArchivo('Contrato', 'Web ../../ "Café"')).toBe('Contrato-Web_Cafe.pdf');
    });
});

describe('plantillas', () => {
    it('factura: asunto, importe en euros y enlace de pago', () => {
        const c = correoDeFactura({ cliente: 'Marta', numero: 'INV-2026-0005', totalCents: 181500, enlacePago: 'https://devfreelancer.app/pay/abc' });
        expect(c.asunto).toBe('Factura INV-2026-0005');
        expect(c.html).toContain('1815,00');
        expect(c.html).toContain('href="https://devfreelancer.app/pay/abc"');
    });
    it('los datos del usuario van escapados: no se puede meter HTML ni enlaces', () => {
        const c = correoDeFactura({ cliente: '<a href="https://evil.com">pincha</a>', numero: '1', totalCents: 100, enlacePago: 'https://devfreelancer.app/pay/x' });
        expect(c.html).not.toContain('<a href="https://evil.com"');
        expect(c.html).toContain('&lt;a href=&quot;https://evil.com&quot;&gt;');
    });
    it('contrato: proyecto y enlace al portal', () => {
        const c = correoDeContrato({ cliente: 'Luis', proyecto: 'App reservas', firma: 'Ana', enlacePortal: 'https://devfreelancer.app/portal/contracts/1' });
        expect(c.asunto).toBe('Contrato para el proyecto "App reservas"');
        expect(c.html).toContain('/portal/contracts/1');
    });
    it('escaparHtml', () => {
        expect(escaparHtml(`<b>"&'</b>`)).toBe('&lt;b&gt;&quot;&amp;&#39;&lt;/b&gt;');
    });
});
