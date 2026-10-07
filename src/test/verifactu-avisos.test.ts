// @vitest-environment node
// Verifactu, fase 3: correos al usuario cuando el envío a la AEAT necesita algo de él.
import { describe, it, expect } from 'vitest';
import { esErrorDeCertificado, hayQueAvisar, correoRechazo, correoCertificado } from '../../supabase/functions/_shared/verifactu-avisos';

describe('avisos de Verifactu', () => {
  it('solo los errores del certificado piden acción al usuario; la AEAT caída, no', () => {
    for (const c of ['SIN_CERTIFICADO', 'CADUCADO', 'ILEGIBLE', '401', '403']) expect(esErrorDeCertificado(c), c).toBe(true);
    for (const c of ['CONEXION', '500', '503', '4118', null]) expect(esErrorDeCertificado(c), String(c)).toBe(false);
  });

  it('el mismo aviso, como mucho una vez al día; otro motivo, enseguida', () => {
    const ahora = new Date('2026-10-07T12:00:00Z');
    expect(hayQueAvisar('certificado:CADUCADO', null, ahora)).toBe(true);
    expect(hayQueAvisar('certificado:CADUCADO', { motivo: 'certificado:CADUCADO', en: '2026-10-07T08:00:00Z' }, ahora)).toBe(false);
    expect(hayQueAvisar('certificado:CADUCADO', { motivo: 'certificado:CADUCADO', en: '2026-10-06T11:00:00Z' }, ahora)).toBe(true);
    expect(hayQueAvisar('certificado:SIN_CERTIFICADO', { motivo: 'certificado:CADUCADO', en: '2026-10-07T11:59:00Z' }, ahora)).toBe(true);
  });

  it('el correo de rechazo lista cada factura con su error y escapa el HTML', () => {
    const c = correoRechazo('Ana', [
      { numero: 'F-2026-007', codigo: '1239', error: 'El NIF no está identificado en el censo <de la AEAT>' },
      { numero: 'F-2026-008', codigo: null, error: null },
    ]);
    expect(c.asunto).toBe('Hacienda ha rechazado 2 registros de tus facturas');
    expect(c.html).toContain('F-2026-007');
    expect(c.html).toContain('&lt;de la AEAT&gt;');
    expect(c.html).toContain('Corregir y reenviar');
    expect(correoRechazo('', [{ numero: 'F-1', codigo: '1239', error: 'x' }]).asunto).toContain('F-1');
  });

  it('el correo del certificado dice cuántos registros esperan', () => {
    const c = correoCertificado('Ana', 'Tu certificado digital caducó el 01/10/2026.', 3);
    expect(c.html).toContain('3 registros esperando');
    expect(c.html).toContain('Hola Ana. Tu certificado');
  });
});
