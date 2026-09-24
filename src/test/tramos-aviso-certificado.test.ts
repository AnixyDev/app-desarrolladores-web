import { describe, it, expect } from 'vitest';
import {
  TRAMOS_DE_AVISO,
  tramoQueCorresponde,
  hayQueAvisar,
  nivelDeCaducidad,
} from '../../supabase/functions/_shared/caducidad-certificado';

describe('tramoQueCorresponde', () => {
  it('lejos de caducar no toca avisar', () => {
    expect(tramoQueCorresponde(365)).toBeNull();
    expect(tramoQueCorresponde(100)).toBeNull();
    expect(tramoQueCorresponde(61)).toBeNull();
  });

  it('el dia 60 exacto ya entra', () => {
    expect(tramoQueCorresponde(60)).toBe(60);
  });

  it('devuelve el tramo mas urgente ya cruzado, no el primero', () => {
    // A 5 dias los tramos de 60 y 30 ya se mandaron; el que toca es el de 7.
    expect(tramoQueCorresponde(5)).toBe(7);
    expect(tramoQueCorresponde(29)).toBe(30);
    expect(tramoQueCorresponde(45)).toBe(60);
  });

  it('el dia del vencimiento y despues caen en el tramo 0', () => {
    expect(tramoQueCorresponde(0)).toBe(0);
    expect(tramoQueCorresponde(-1)).toBe(0);
    expect(tramoQueCorresponde(-400)).toBe(0);
  });

  it('un numero que no es numero no dispara nada', () => {
    expect(tramoQueCorresponde(NaN)).toBeNull();
    expect(tramoQueCorresponde(Infinity)).toBeNull();
  });
});

describe('hayQueAvisar — una vez por tramo', () => {
  it('la primera vez en cada tramo, avisa', () => {
    expect(hayQueAvisar(60, null)).toEqual({ avisar: true, tramo: 60 });
    expect(hayQueAvisar(30, null)).toEqual({ avisar: true, tramo: 30 });
    expect(hayQueAvisar(7, null)).toEqual({ avisar: true, tramo: 7 });
    expect(hayQueAvisar(-2, null)).toEqual({ avisar: true, tramo: 0 });
  });

  it('el dia siguiente, dentro del mismo tramo, NO repite', () => {
    // Este es el caso que importa: sin esto el correo sale cada dia durante
    // dos meses y el usuario deja de leerlo.
    expect(hayQueAvisar(59, 60).avisar).toBe(false);
    expect(hayQueAvisar(45, 60).avisar).toBe(false);
    expect(hayQueAvisar(31, 60).avisar).toBe(false);
  });

  it('al cruzar al tramo siguiente, vuelve a avisar', () => {
    expect(hayQueAvisar(30, 60)).toEqual({ avisar: true, tramo: 30 });
    expect(hayQueAvisar(7, 30)).toEqual({ avisar: true, tramo: 7 });
    expect(hayQueAvisar(0, 7)).toEqual({ avisar: true, tramo: 0 });
  });

  it('ya caducado y ya avisado, no insiste todos los dias', () => {
    expect(hayQueAvisar(-1, 0).avisar).toBe(false);
    expect(hayQueAvisar(-500, 0).avisar).toBe(false);
  });

  it('nunca retrocede: si ya se aviso de 7, no manda el de 30', () => {
    expect(hayQueAvisar(30, 7).avisar).toBe(false);
    expect(hayQueAvisar(60, 0).avisar).toBe(false);
  });

  it('lejos de caducar no avisa aunque no se haya avisado nunca', () => {
    expect(hayQueAvisar(200, null)).toEqual({ avisar: false, tramo: null });
  });

  it('son como mucho cuatro correos por certificado', () => {
    // Se simula el paso del tiempo dia a dia, desde 90 hasta -5, y se cuentan
    // los correos que saldrian.
    let ultimoTramo: number | null = null;
    let correos = 0;
    for (let dias = 90; dias >= -5; dias--) {
      const { avisar, tramo } = hayQueAvisar(dias, ultimoTramo);
      if (avisar && tramo !== null) {
        correos++;
        ultimoTramo = tramo;
      }
    }
    expect(correos).toBe(TRAMOS_DE_AVISO.length);
    expect(correos).toBe(4);
  });
});

describe('certificado nuevo', () => {
  it('con el contador a cero vuelve a avisar desde el principio', () => {
    // Al subir un certificado nuevo, la Edge Function compara la fecha de
    // caducidad guardada con la actual; si no coinciden pasa null, que es
    // como no haber avisado nunca.
    expect(hayQueAvisar(60, null).avisar).toBe(true);
  });
});

describe('nivelDeCaducidad — coherente con los tramos', () => {
  const enDias = (dias: number) =>
    new Date(Date.now() + dias * 24 * 60 * 60 * 1000 + 60_000).toISOString();

  it('sin fecha no hay nivel', () => {
    expect(nivelDeCaducidad(null)).toBeNull();
    expect(nivelDeCaducidad(undefined)).toBeNull();
    expect(nivelDeCaducidad('no es una fecha')).toBeNull();
  });

  it('el primer tramo de aviso cae dentro del nivel "aviso" o peor', () => {
    const estado = nivelDeCaducidad(enDias(60));
    expect(estado).not.toBeNull();
    expect(['aviso', 'urgente']).toContain(estado!.nivel);
  });

  it('lo ya caducado sale con dias negativos', () => {
    const estado = nivelDeCaducidad(enDias(-3));
    expect(estado!.nivel).toBe('caducado');
    expect(estado!.dias).toBeLessThan(0);
  });

  it('la fecha se escribe en espanol', () => {
    const estado = nivelDeCaducidad('2029-06-25T00:00:00.000Z');
    expect(estado!.fechaTexto).toMatch(/junio/);
    expect(estado!.fechaTexto).toMatch(/2029/);
  });
});
