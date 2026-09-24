import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  puedeInvitarAlPortal,
  INVITACIONES_PORTAL_POR_DIA,
  ESPERA_ENTRE_REENVIOS_MINUTOS,
} from '../../supabase/functions/_shared/limites-portal';

// El Portal de Cliente estaba construido entero — proyectos, facturas,
// presupuestos, contratos, propuestas y el chat — y no habia ninguna forma de
// que un cliente se enterase de que existia: ni funcion, ni boton, ni correo,
// en ninguna parte del codigo.
//
// Al construir la invitacion aparece el riesgo de siempre: el correo sale del
// dominio verificado de la aplicacion. Sin topes, la lista de clientes seria
// una lanzadera de correo. Estas comprobaciones vigilan los topes y, leyendo
// el codigo fuente, que el destinatario no vuelva a viajar desde el navegador.

const AHORA = new Date('2026-09-24T22:00:00Z');
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60 * 1000);

describe('tope diario de invitaciones al portal', () => {
  it('la primera invitacion del dia pasa', () => {
    expect(puedeInvitarAlPortal(0, null, AHORA).permitida).toBe(true);
  });

  it('justo por debajo del tope, pasa', () => {
    const v = puedeInvitarAlPortal(INVITACIONES_PORTAL_POR_DIA - 1, null, AHORA);
    expect(v.permitida).toBe(true);
  });

  it('en el tope, no pasa', () => {
    const v = puedeInvitarAlPortal(INVITACIONES_PORTAL_POR_DIA, null, AHORA);
    expect(v.permitida).toBe(false);
    expect(v.motivo).toContain(String(INVITACIONES_PORTAL_POR_DIA));
  });

  it('por encima del tope tampoco', () => {
    expect(puedeInvitarAlPortal(INVITACIONES_PORTAL_POR_DIA + 5, null, AHORA).permitida).toBe(false);
  });
});

describe('espera entre reenvios al mismo cliente', () => {
  // El tope diario cuenta clientes distintos: reinvitar actualiza la fila en
  // vez de anadir otra. Sin esta espera se podria bombardear una sola
  // direccion pulsando el boton sin parar.
  it('recien invitado, no se puede reenviar', () => {
    const v = puedeInvitarAlPortal(0, haceMinutos(1), AHORA);
    expect(v.permitida).toBe(false);
    expect(v.motivo).toContain(String(ESPERA_ENTRE_REENVIOS_MINUTOS));
  });

  it('justo antes de cumplirse la espera, no', () => {
    expect(puedeInvitarAlPortal(0, haceMinutos(ESPERA_ENTRE_REENVIOS_MINUTOS - 1), AHORA).permitida)
      .toBe(false);
  });

  it('cumplida la espera, si', () => {
    expect(puedeInvitarAlPortal(0, haceMinutos(ESPERA_ENTRE_REENVIOS_MINUTOS), AHORA).permitida)
      .toBe(true);
  });

  it('pasado un dia, si', () => {
    expect(puedeInvitarAlPortal(0, haceMinutos(60 * 24), AHORA).permitida).toBe(true);
  });

  it('acepta la fecha como texto, que es como llega de la base de datos', () => {
    const texto = haceMinutos(1).toISOString();
    expect(puedeInvitarAlPortal(0, texto, AHORA).permitida).toBe(false);
  });

  it('una fecha en el futuro no abre la puerta', () => {
    // Reloj torcido o dato corrupto: la resta sale negativa. Si se comparara
    // con un `Math.abs` o solo por arriba, esto colaria.
    const futuro = new Date(AHORA.getTime() + 60 * 60 * 1000);
    expect(puedeInvitarAlPortal(0, futuro, AHORA).permitida).toBe(false);
  });

  it('una fecha ilegible se trata como "nunca invitado"', () => {
    // Mejor dejar invitar que bloquear a alguien para siempre por un dato
    // corrupto. El tope diario sigue puesto.
    expect(puedeInvitarAlPortal(0, 'no-es-una-fecha', AHORA).permitida).toBe(true);
    expect(puedeInvitarAlPortal(INVITACIONES_PORTAL_POR_DIA, 'no-es-una-fecha', AHORA).permitida)
      .toBe(false);
  });
});

describe('la espera manda sobre el tope', () => {
  it('con el tope libre pero recien invitado, no pasa', () => {
    expect(puedeInvitarAlPortal(0, haceMinutos(1), AHORA).permitida).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8');

const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el destinatario no viaja desde el navegador', () => {
  const funcion = sinComentarios(leer('supabase/functions/invite-portal-client/index.ts'));
  const slice = sinComentarios(leer('hooks/store/clientSlice.ts'));

  it('la Edge Function solo saca clientId del cuerpo', () => {
    // Si aceptara `email`, cualquiera con sesion podria mandar correo desde el
    // dominio verificado a una direccion arbitraria — que es exactamente lo
    // que era `send-document-email` antes de la auditoria.
    const destructuracion = funcion.match(/const\s*\{([^}]*)\}\s*=\s*await\s+req\.json\(\)/);
    expect(destructuracion, 'no encuentro la lectura del cuerpo').not.toBeNull();
    expect(destructuracion![1]).toContain('clientId');
    expect(destructuracion![1]).not.toMatch(/email/i);
  });

  it('la direccion se lee de la ficha, y la ficha tiene que ser del que llama', () => {
    expect(funcion).toMatch(/from\(['"]clients['"]\)/);
    expect(funcion).toMatch(/\.eq\(['"]user_id['"],\s*freelancer\.id\)/);
  });

  it('el navegador solo manda el identificador', () => {
    const cuerpo = slice.match(/invoke\(['"]invite-portal-client['"],\s*\{\s*body:\s*\{([^}]*)\}/);
    expect(cuerpo, 'no encuentro la llamada a la funcion').not.toBeNull();
    expect(cuerpo![1]).toContain('clientId');
    expect(cuerpo![1]).not.toMatch(/email/i);
  });
});

describe('el correo de invitacion no lleva llaves', () => {
  const funcion = leer('supabase/functions/invite-portal-client/index.ts');

  it('no genera ningun enlace de acceso', () => {
    // Un enlace magico caduca en una hora; una invitacion se lee cuando se
    // lee. Y un correo reenviado no debe dar acceso a nada.
    expect(funcion).not.toMatch(/generateLink|action_link|inviteUserByEmail|signInWithOtp/);
  });

  it('el boton lleva al formulario del portal con la direccion puesta', () => {
    expect(funcion).toMatch(/\/portal\/login\?email=\$\{encodeURIComponent/);
  });

  it('el destino del enlace no sale de una cabecera sin validar', () => {
    expect(funcion).toMatch(/origenSeguro\(req\.headers\.get\('Origin'\)\)/);
    expect(funcion).toMatch(/const enlace = `\$\{origin\}/);
  });

  it('escapa el nombre del cliente y el del freelancer en el HTML', () => {
    expect(funcion).toMatch(/escaparHtml/);
  });
});

describe('la marca de invitado solo se pone si el correo salio', () => {
  const funcion = sinComentarios(leer('supabase/functions/invite-portal-client/index.ts'));

  it('se comprueba la respuesta de Resend antes de marcar', () => {
    const posicionComprobacion = funcion.indexOf('respuestaResend.ok');
    const posicionMarca = funcion.indexOf('portal_invitado_en:');
    expect(posicionComprobacion, 'no se comprueba la respuesta de Resend').toBeGreaterThan(-1);
    expect(posicionMarca, 'no se marca la invitacion').toBeGreaterThan(-1);
    expect(posicionComprobacion).toBeLessThan(posicionMarca);
  });

  it('no se le devuelve al navegador el error crudo de Resend', () => {
    // Puede llevar detalles de la cuenta de correo.
    expect(funcion).not.toMatch(/message:\s*detalle|JSON\.stringify\(detalle\)/);
  });
});

describe('el formulario del portal acepta la direccion prefijada', () => {
  it('PortalLoginPage la lee de la URL', () => {
    const login = leer('pages/portal/PortalLoginPage.tsx');
    expect(login).toMatch(/useSearchParams/);
    expect(login).toMatch(/searchParams\.get\(['"]email['"]\)/);
  });
});
