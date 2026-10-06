import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  planPermiteRemitentePropio,
  normalizarDireccion,
  normalizarClaveResend,
  esDominioDeCorreoGratuito,
  nombreVisiblePropio,
  formatearRemitente,
  motivoDelRechazo,
  cargarRemitentePropio,
  enviarPorResend,
  TOPES_CON_REMITENTE_PROPIO,
} from '../../supabase/functions/_shared/remitente-propio';
import { ENVIOS_DE_DOCUMENTOS_POR_DIA } from '../../supabase/functions/_shared/correo-documentos';
import { INVITACIONES_PORTAL_POR_DIA } from '../../supabase/functions/_shared/limites-portal';
import { claveAes, cifrarTexto, descifradorConClave } from '../../supabase/functions/_shared/cripto';

const HEX = 'a'.repeat(64);

describe('quién puede usar su propio dominio', () => {
  it('Pro y Teams sí; Free y valores raros no', () => {
    expect(planPermiteRemitentePropio('Pro')).toBe(true);
    expect(planPermiteRemitentePropio('Teams')).toBe(true);
    expect(planPermiteRemitentePropio('Free')).toBe(false);
    expect(planPermiteRemitentePropio(undefined)).toBe(false);
    expect(planPermiteRemitentePropio('pro')).toBe(false);
  });
});

describe('validación de lo que escribe el usuario', () => {
  it('normaliza la dirección y rechaza lo que no lo es', () => {
    expect(normalizarDireccion('  Facturas@MiDominio.ES ')).toBe('facturas@midominio.es');
    expect(normalizarDireccion('sin-arroba')).toBeNull();
    expect(normalizarDireccion('Nombre <a@b.com>')).toBeNull();
    expect(normalizarDireccion('a@b.c')).toBeNull();
  });

  it('las direcciones de correo gratuito no valen (Resend no puede verificarlas)', () => {
    expect(esDominioDeCorreoGratuito('ana@gmail.com')).toBe(true);
    expect(esDominioDeCorreoGratuito('ana@outlook.es')).toBe(true);
    expect(esDominioDeCorreoGratuito('facturas@anixydev.com')).toBe(false);
  });

  it('la clave tiene que tener forma de clave de Resend', () => {
    expect(normalizarClaveResend('  re_AbCdEf123456_xyz ')).toBe('re_AbCdEf123456_xyz');
    expect(normalizarClaveResend('sk_live_123456789012')).toBeNull();
    expect(normalizarClaveResend('re_corta')).toBeNull();
    expect(normalizarClaveResend('re_con espacios dentro')).toBeNull();
  });
});

describe('remitente visible', () => {
  it('sin «vía DevFreelancer» y sin caracteres que rompan la cabecera', () => {
    const nombre = nombreVisiblePropio('Estudio <Ana>\r\nBcc: x@y.com');
    expect(nombre).not.toMatch(/[<>\r\n]/);
    expect(nombre).not.toMatch(/DevFreelancer/);
    expect(formatearRemitente(nombre, 'facturas@ana.dev')).toBe(`${nombre} <facturas@ana.dev>`);
  });

  it('si no hay nombre, uno neutro', () => {
    expect(nombreVisiblePropio('')).toBe('Facturación');
  });
});

describe('motivo del rechazo de su Resend', () => {
  it('clave mala', () => {
    expect(motivoDelRechazo(401, { message: 'API key is invalid' })).toMatch(/clave/);
  });
  it('dominio sin verificar', () => {
    expect(motivoDelRechazo(403, { message: 'The ana.dev domain is not verified.' })).toMatch(/clave|dominio/);
    expect(motivoDelRechazo(422, { message: 'The ana.dev domain is not verified.' })).toMatch(/dominio/);
  });
  it('límite de su cuenta', () => {
    expect(motivoDelRechazo(429, {})).toMatch(/límite/);
  });
  it('no mete saltos de línea ni textos enormes', () => {
    const m = motivoDelRechazo(500, { message: 'x\n'.repeat(500) });
    expect(m).not.toMatch(/\n/);
    expect(m.length).toBeLessThan(400);
  });
});

describe('los topes con dominio propio son más altos que los de la plataforma', () => {
  it('documentos e invitaciones', () => {
    expect(TOPES_CON_REMITENTE_PROPIO.documentosPorDia).toBeGreaterThan(ENVIOS_DE_DOCUMENTOS_POR_DIA);
    expect(TOPES_CON_REMITENTE_PROPIO.invitacionesPortalPorDia).toBeGreaterThan(INVITACIONES_PORTAL_POR_DIA);
  });
});

/** Cliente falso con la forma mínima de supabase-js que usa cargarRemitentePropio. */
const clienteCon = (fila: Record<string, unknown> | null) => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fila, error: null }) }) }),
  }),
});

describe('cargarRemitentePropio', () => {
  it('descifra la clave guardada (mismo cifrado que manage-secrets)', async () => {
    const cifrada = await cifrarTexto('re_clave_de_prueba_123', await claveAes(HEX));
    const r = await cargarRemitentePropio(
      clienteCon({ resend_api_key_encrypted: cifrada, resend_from_email: 'facturas@ana.dev' }),
      'u1', 'Pro', descifradorConClave(HEX),
    );
    expect(r).toEqual({ propio: true, apiKey: 're_clave_de_prueba_123', direccion: 'facturas@ana.dev' });
  });

  it('si baja a Free, se ignora y envía la plataforma', async () => {
    const r = await cargarRemitentePropio(
      clienteCon({ resend_api_key_encrypted: 'x', resend_from_email: 'facturas@ana.dev' }),
      'u1', 'Free', descifradorConClave(HEX),
    );
    expect(r).toBeNull();
  });

  it('sin configuración, null', async () => {
    expect(await cargarRemitentePropio(clienteCon(null), 'u1', 'Pro', descifradorConClave(HEX))).toBeNull();
  });

  it('si no se puede descifrar, null (no bloquea sus envíos)', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await cargarRemitentePropio(
      clienteCon({ resend_api_key_encrypted: 'basura', resend_from_email: 'facturas@ana.dev' }),
      'u1', 'Teams', descifradorConClave(HEX),
    );
    expect(r).toBeNull();
    espia.mockRestore();
  });

  it('sin clave de cifrado en el servidor, null', async () => {
    expect(descifradorConClave(undefined)).toBeNull();
  });
});

describe('enviarPorResend', () => {
  it('manda la clave en la cabecera y devuelve el resultado', async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    const r = await enviarPorResend('re_x', { to: ['a@b.com'] }, fetchFalso as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, status: 200, cuerpo: { id: 'abc' } });
    const [, opciones] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer re_x');
  });

  it('un cuerpo que no es JSON no rompe', async () => {
    const fetchFalso = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    const r = await enviarPorResend('re_x', {}, fetchFalso as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
  });
});

describe('las tres funciones de envío usan el remitente propio', () => {
  const RAIZ = path.resolve(__dirname, '../..');
  it.each([
    'supabase/functions/send-document-email/index.ts',
    'supabase/functions/recordatorios-cobro/index.ts',
    'supabase/functions/invite-portal-client/index.ts',
  ])('%s', (fichero) => {
    const codigo = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
    expect(codigo).toMatch(/cargarRemitentePropio\(/);
    expect(codigo).toMatch(/enviarPorResend\(/);
    // Nada de fetch directo a Resend que se salte el remitente propio.
    expect(codigo).not.toMatch(/fetch\(\s*RESEND_API_URL/);
  });
});
