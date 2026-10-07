import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AEAT_QR_SERVICIO, AEAT_QR_VALIDAR_PRUEBAS, construirUrlQrTributario, datosFiscalesPdf } from '@/services/pdfService';
import { textoEstadoEnvio } from '@/components/settings/EstadoEnvioVerifactu';

const registro = { modalidad: 'verifactu' as const, hash: 'ABC', nif_emisor: '74870299D', importe_total_cents: 121000 };
const base = { nif: '74870299D', numeroFactura: 'PRUEBA-B073-01', fechaEmision: '2026-10-07', totalCents: 121000, modalidad: 'verifactu' as const };

describe('Verifactu por entorno (fase 4)', () => {
  it('un registro interno (la cuenta aún no envía) no lleva QR', () => {
    expect(datosFiscalesPdf(null)).toBeNull();
    expect(datosFiscalesPdf({ ...registro, entorno: null })).toBeNull();
    expect(datosFiscalesPdf({ ...registro, entorno: undefined })).toBeNull();
  });

  it('un registro enviado lleva su entorno al QR', () => {
    expect(datosFiscalesPdf({ ...registro, entorno: 'produccion' })).toMatchObject({ entorno: 'produccion', nifEmisor: '74870299D', importeTotalCents: 121000 });
    expect(datosFiscalesPdf({ ...registro, entorno: 'pruebas' })?.entorno).toBe('pruebas');
  });

  it('el QR de pruebas apunta al cotejo de pruebas; el real, al de producción', () => {
    const pruebas = new URL(construirUrlQrTributario({ ...base, entorno: 'pruebas' }));
    expect(`${pruebas.origin}${pruebas.pathname}`).toBe(AEAT_QR_VALIDAR_PRUEBAS);
    // Mismo formato que se comprobó en la web de cotejo de la AEAT el 07/10/2026.
    expect(pruebas.search).toBe('?nif=74870299D&numserie=PRUEBA-B073-01&fecha=07-10-2026&importe=1210.00');
    const real = new URL(construirUrlQrTributario({ ...base, entorno: 'produccion' }));
    expect(`${real.origin}${real.pathname}`).toBe(AEAT_QR_SERVICIO.verifactu);
  });

  it('Ajustes explica en qué punto está la cuenta', () => {
    expect(textoEstadoEnvio('sin_envio', true).titulo).toMatch(/todavía no/);
    expect(textoEstadoEnvio('pruebas', true).detalle).toMatch(/no tienen validez fiscal/);
    expect(textoEstadoEnvio('produccion', true).titulo).toMatch(/activado/);
    expect(textoEstadoEnvio('produccion', false).titulo).toMatch(/desactivado/);
  });

  it('Ajustes ya no ofrece «No Verifactu»', () => {
    const ajustes = readFileSync(join(process.cwd(), 'pages/SettingsPage.tsx'), 'utf8');
    expect(ajustes).not.toMatch(/no_verifactu/);
    expect(ajustes).toMatch(/updateVeriFactuSettings\(!profile\?\.veri_factu_enabled, 'verifactu'\)/);
  });
});
