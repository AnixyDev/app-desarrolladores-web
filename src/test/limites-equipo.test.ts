import { describe, it, expect } from 'vitest';
import {
  MIEMBROS_POR_PLAN,
  INVITACIONES_POR_DIA,
  limiteDeMiembros,
  puedeInvitar,
} from '../../supabase/functions/_shared/limites-equipo';

describe('limiteDeMiembros', () => {
  it('Teams permite 5, que es lo que anuncia la pagina de precios', () => {
    expect(limiteDeMiembros('Teams')).toBe(5);
    expect(MIEMBROS_POR_PLAN.Teams).toBe(5);
  });

  it('Free y Pro no incluyen miembros de equipo', () => {
    expect(limiteDeMiembros('Free')).toBe(0);
    expect(limiteDeMiembros('Pro')).toBe(0);
  });

  it('un plan desconocido no permite ninguno', () => {
    expect(limiteDeMiembros('Enterprise')).toBe(0);
    expect(limiteDeMiembros('')).toBe(0);
  });

  it('no se cuela nada por el prototipo', () => {
    // Con acceso por corchetes, 'constructor' devolveria una funcion y
    // cualquier comparacion posterior se comportaria de forma imprevisible.
    expect(limiteDeMiembros('constructor')).toBe(0);
    expect(limiteDeMiembros('toString')).toBe(0);
    expect(limiteDeMiembros('__proto__')).toBe(0);
    expect(limiteDeMiembros('hasOwnProperty')).toBe(0);
  });

  it('un plan que no es texto no permite ninguno', () => {
    expect(limiteDeMiembros(undefined)).toBe(0);
    expect(limiteDeMiembros(null)).toBe(0);
    expect(limiteDeMiembros(5)).toBe(0);
    expect(limiteDeMiembros({ plan: 'Teams' })).toBe(0);
    expect(limiteDeMiembros(['Teams'])).toBe(0);
  });
});

describe('puedeInvitar — limite del plan', () => {
  it('un usuario Teams sin equipo puede invitar', () => {
    expect(puedeInvitar('Teams', 0).permitida).toBe(true);
  });

  it('un usuario Teams con 4 miembros puede invitar al quinto', () => {
    expect(puedeInvitar('Teams', 4).permitida).toBe(true);
  });

  it('un usuario Teams con 5 miembros ya no puede', () => {
    const r = puedeInvitar('Teams', 5);
    expect(r.permitida).toBe(false);
    expect(r.motivo).toContain('5');
  });

  it('por encima del limite tampoco, aunque se haya llegado por otra via', () => {
    expect(puedeInvitar('Teams', 9).permitida).toBe(false);
  });

  it('Free y Pro no pueden invitar ni al primero', () => {
    for (const plan of ['Free', 'Pro']) {
      const r = puedeInvitar(plan, 0);
      expect(r.permitida).toBe(false);
      expect(r.motivo).toContain('Teams');
    }
  });

  it('un plan inventado no da barra libre', () => {
    expect(puedeInvitar('Teams ', 0).permitida).toBe(false);
    expect(puedeInvitar('teams', 0).permitida).toBe(false);
    expect(puedeInvitar('Enterprise', 0).permitida).toBe(false);
  });
});

describe('puedeInvitar — tope diario de envios', () => {
  it('por debajo del tope se puede invitar', () => {
    expect(puedeInvitar('Teams', 0, INVITACIONES_POR_DIA - 1).permitida).toBe(true);
  });

  it('en el tope se corta', () => {
    const r = puedeInvitar('Teams', 0, INVITACIONES_POR_DIA);
    expect(r.permitida).toBe(false);
    expect(r.motivo).toContain('24 horas');
  });

  it('por encima del tope tambien', () => {
    expect(puedeInvitar('Teams', 0, INVITACIONES_POR_DIA + 50).permitida).toBe(false);
  });

  it('el tope diario manda sobre el limite del plan', () => {
    // Un usuario Teams con sitio de sobra, pero que ya ha enviado el maximo:
    // el motivo tiene que ser el tope diario, no el del plan.
    const r = puedeInvitar('Teams', 0, INVITACIONES_POR_DIA);
    expect(r.motivo).toContain('24 horas');
    expect(r.motivo).not.toContain('plan Teams');
  });

  it('sin indicar envios se asume ninguno', () => {
    expect(puedeInvitar('Teams', 0).permitida).toBe(true);
  });

  it('el tope es holgado para montar un equipo entero', () => {
    // 5 plazas, con erratas y reenvios, no deberia acercarse al tope.
    expect(INVITACIONES_POR_DIA).toBeGreaterThan(MIEMBROS_POR_PLAN.Teams * 3);
  });
});

describe('puedeInvitar — forma del resultado', () => {
  it('cuando permite, el motivo va vacio', () => {
    expect(puedeInvitar('Teams', 0)).toEqual({ permitida: true, motivo: '' });
  });

  it('cuando rechaza, siempre explica por que', () => {
    for (const caso of [
      puedeInvitar('Free', 0),
      puedeInvitar('Teams', 5),
      puedeInvitar('Teams', 0, INVITACIONES_POR_DIA),
    ]) {
      expect(caso.permitida).toBe(false);
      expect(caso.motivo.length).toBeGreaterThan(10);
    }
  });
});
