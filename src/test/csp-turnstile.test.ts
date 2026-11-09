import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * El captcha de Cloudflare Turnstile se carga desde challenges.cloudflare.com y
 * pinta su reto en un iframe de ese mismo dominio. Si la CSP de vercel.json no
 * lo permite en script-src y frame-src, el navegador lo bloquea, el widget no
 * carga y el boton de acceso queda deshabilitado: nadie puede entrar ni
 * registrarse (paso del 22/10 al 09/11 de 2026).
 */

const RAIZ = path.resolve(__dirname, '../..');
const TURNSTILE = 'https://challenges.cloudflare.com';

function directiva(csp: string, nombre: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d === nombre || d.startsWith(nombre + ' ')) ?? ''
  );
}

describe('CSP de vercel.json permite Turnstile', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const csp: string =
    (vercel.headers ?? [])
      .flatMap((h: { headers?: { key: string; value: string }[] }) => h.headers ?? [])
      .find((h: { key: string }) => h.key === 'Content-Security-Policy')?.value ?? '';

  it('existe la cabecera Content-Security-Policy', () => {
    expect(csp.length).toBeGreaterThan(0);
  });

  it('script-src permite el script de Turnstile', () => {
    expect(directiva(csp, 'script-src')).toContain(TURNSTILE);
  });

  it('frame-src permite el iframe de Turnstile', () => {
    expect(directiva(csp, 'frame-src')).toContain(TURNSTILE);
  });
});
