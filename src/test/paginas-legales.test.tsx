import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PieLegal from '../../components/PieLegal';
import AvisoLegalPage from '../../pages/legal/AvisoLegalPage';
import PrivacidadPage from '../../pages/legal/PrivacidadPage';
import CookiesPage from '../../pages/legal/CookiesPage';
import TermsOfService from '../../pages/TermsOfService';
import { DATOS_LEGALES, esMarcador } from '../../lib/datosLegales';

const raiz = resolve(__dirname, '../..');
const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');

const montar = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/aviso-legal" element={<AvisoLegalPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        <Route path="/privacy" element={<PrivacidadPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </MemoryRouter>,
  );

describe('pie legal', () => {
  it('enlaza las cuatro páginas legales', () => {
    render(<MemoryRouter><PieLegal /></MemoryRouter>);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/aviso-legal', '/privacidad', '/cookies', '/terms']);
  });

  it('está en la home, precios, acceso, portal, pago de factura, cuenta eliminada y menú de la app', () => {
    for (const f of [
      'pages/LandingPage.tsx', 'components/auth/AuthCard.tsx', 'pages/portal/PortalLoginPage.tsx',
      'pages/PublicInvoicePayPage.tsx', 'pages/CuentaEliminadaPage.tsx', 'components/layout/Sidebar.tsx',
      'components/legal/PaginaLegal.tsx',
    ]) expect(leer(f), f).toMatch(/<PieLegal/);
    expect(leer('pages/PricingPage.tsx')).toMatch(/ENLACES_LEGALES\.map/);
  });

  it('las rutas existen en App.tsx y /privacy sigue funcionando', () => {
    const app = leer('App.tsx');
    for (const r of ['/aviso-legal', '/privacidad', '/privacy', '/cookies', '/terms'])
      expect(app).toContain(`path="${r}"`);
  });
});

describe('páginas legales', () => {
  it('el aviso legal muestra los datos del titular (resaltados mientras sean marcadores)', () => {
    const { container } = montar('/aviso-legal');
    expect(screen.getByRole('heading', { level: 1, name: 'Aviso legal' })).toBeInTheDocument();
    const texto = container.textContent ?? '';
    for (const v of [DATOS_LEGALES.titular, DATOS_LEGALES.nif, DATOS_LEGALES.domicilio, DATOS_LEGALES.email]) {
      expect(texto, v).toContain(v);
      if (esMarcador(v)) expect(screen.getByText(v).tagName).toBe('MARK');
    }
  });

  it('/privacy y /privacidad muestran la misma política', () => {
    const a = montar('/privacy').container.textContent;
    const b = montar('/privacidad').container.textContent;
    expect(a).toContain('Política de privacidad');
    expect(a).toBe(b);
  });

  it('la privacidad cubre transferencias, Enable Banking y Gemini', () => {
    const { container } = montar('/privacidad');
    const t = container.textContent ?? '';
    for (const s of ['Stripe', 'Vercel', 'Google', 'Cloudflare', 'Resend', 'ImprovMX', 'Enable Banking', 'Marco de Privacidad de Datos', 'Cláusulas Contractuales Tipo', 'consentimiento', 'Gemini', 'Lead Hunter']) {
      expect(t, s).toContain(s);
    }
  });

  it('la política de cookies lista cada cookie y clave de almacenamiento local', () => {
    const { container } = montar('/cookies');
    const t = container.textContent ?? '';
    for (const k of [
      'sb-umqsjycqypxvhbhmidma-auth-token', '__stripe_mid', '__stripe_sid', 'devfreelancer-storage-v4',
      'devfreelancer_active_timer', 'devfreelancer_oferta_fundadores', 'portal:destino', 'portal:cliente',
    ]) expect(t, k).toContain(k);
    // Ya no se guarda nada que no sea técnico.
    expect(t).not.toContain('devfreelancer_ref');
    expect(t).not.toContain('df_cookie');
  });

  it('cada clave de localStorage del código aparece en /cookies', () => {
    const cookies = leer('pages/legal/CookiesPage.tsx');
    const fuentes = ['lib/afiliados.ts', 'lib/intencionFundadores.ts', 'lib/destinoPortal.ts', 'lib/portalClientes.ts', 'hooks/store/projectSlice.ts', 'hooks/useAppStore.tsx'];
    for (const f of fuentes) {
      for (const [, clave] of leer(f).matchAll(/(?:CLAVE|KEY|name)\s*[:=]\s*'([^']+)'/g)) {
        expect(cookies, `${clave} (${f})`).toContain(clave);
      }
    }
  });

  it('los términos incluyen renovación, cancelación, desistimiento y Fundadores', () => {
    const { container } = montar('/terms');
    const t = container.textContent ?? '';
    for (const s of ['renuevan automáticamente', 'Cómo cancelar', '14 días naturales', 'Plan Fundadores', 'sin interrupción', 'pierdes el precio de fundador', '50 plazas']) {
      expect(t, s).toContain(s);
    }
  });
});

describe('datos del titular', () => {
  it('las páginas legales piden no ser indexadas y lo retiran al salir', () => {
    const { unmount } = montar('/aviso-legal');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('el NIF del titular es válido (letra de control)', () => {
    const m = /^(\d{8})([A-Z])$/.exec(DATOS_LEGALES.nif);
    if (esMarcador(DATOS_LEGALES.nif)) return;
    expect(m, 'formato 12345678Z').not.toBeNull();
    expect('TRWAGMYFPDXBNJZSQVHLCKE'[Number(m![1]) % 23]).toBe(m![2]);
  });
});

describe('Lead Hunter PRO', () => {
  it('privacidad y términos explican que solo se escribe con permiso y que hay baja', () => {
    const t = montar('/privacidad').container.textContent ?? '';
    expect(t).toContain('solo permite enviar emails o mensajes de WhatsApp a los negocios que han dado su permiso');
    expect(t).toContain('enlace para darse de baja');
    expect(montar('/terms').container.textContent).toContain('art. 21 LSSI-CE');
  });
});

describe('fuentes', () => {
  it('ya no se cargan desde Google Fonts', () => {
    expect(leer('index.html')).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(leer('index.css')).toMatch(/font-family: 'Inter'/);
  });
});

describe('Stripe.js', () => {
  it('no se descarga al importar el servicio (solo al pagar), para no poner cookies en la home', () => {
    const f = leer('services/stripeService.ts');
    expect(f).toMatch(/from '@stripe\/stripe-js\/pure'/);
    expect(f).not.toMatch(/^import \{[^}]*\} from '@stripe\/stripe-js';/m);
  });

  it('ya no hay aviso de cookies', () => {
    expect(leer('App.tsx')).not.toMatch(/CookieBanner/);
  });
});
