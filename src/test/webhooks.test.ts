import { describe, it, expect } from 'vitest';
import { urlDeWebhookValida, esperarResultadoPrueba, pruebaCorrecta } from '../../lib/webhooks';

/**
 * Los webhooks los envía la base de datos hacia una dirección que escribe el
 * usuario. La regla que decide qué direcciones valen vive en SQL
 * (public.url_de_webhook_valida); esta es su copia para avisar en el
 * formulario. Los casos son los mismos que se comprobaron contra la función
 * SQL en producción el 26/09: si alguien cambia una de las dos, esto avisa.
 */

describe('urlDeWebhookValida — igual que public.url_de_webhook_valida()', () => {
    it.each([
        'https://hooks.slack.com/services/T0/B0/xyz',
        'https://example.com:8443/hook?a=1',
        'https://hooks.zapier.com/hooks/catch/123/abc/',
    ])('acepta %s', (url) => expect(urlDeWebhookValida(url)).toBe(true));

    it.each([
        ['http sin cifrar', 'http://example.com/hook'],
        ['metadatos de la nube', 'https://169.254.169.254/latest/meta-data'],
        ['localhost', 'https://localhost/x'],
        ['IP con puerto', 'https://127.0.0.1:5432/'],
        ['credenciales que disfrazan el destino', 'https://user:pw@evil.com/'],
        ['dominio interno', 'https://db.internal/x'],
        ['IPv6', 'https://[::1]/x'],
        ['nombre sin dominio', 'https://intranet/x'],
        ['vacía', ''],
    ])('rechaza %s', (_motivo, url) => expect(urlDeWebhookValida(url)).toBe(false));
});

describe('esperarResultadoPrueba', () => {
    it('devuelve en cuanto el destino contesta', async () => {
        let llamadas = 0;
        const r = await esperarResultadoPrueba(async () => {
            llamadas++;
            return llamadas < 3 ? null : { status_code: 200, error: null };
        }, { intentos: 5, esperaMs: 1 });
        expect(r).toEqual({ status: 200, error: null });
        expect(llamadas).toBe(3);
        expect(pruebaCorrecta(r)).toBe(true);
    });

    it('un 404 no es éxito', async () => {
        const r = await esperarResultadoPrueba(async () => ({ status_code: 404, error: null }), { intentos: 2, esperaMs: 1 });
        expect(pruebaCorrecta(r)).toBe(false);
    });

    it('error de red: lo dice', async () => {
        const r = await esperarResultadoPrueba(async () => ({ status_code: null, error: 'Couldn\'t resolve host' }), { intentos: 2, esperaMs: 1 });
        expect(r.error).toContain('resolve');
        expect(pruebaCorrecta(r)).toBe(false);
    });

    it('sin respuesta a tiempo: status null', async () => {
        const r = await esperarResultadoPrueba(async () => null, { intentos: 3, esperaMs: 1 });
        expect(r).toEqual({ status: null, error: null });
    });
});
