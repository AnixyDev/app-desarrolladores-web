// Cuando avisar de que el certificado digital esta a punto de caducar —
// UNICA fuente de verdad.
//
// Los umbrales vivian dentro de pages/SettingsPage.tsx, es decir solo en la
// pantalla de Ajustes: el aviso existia unicamente si el usuario entraba a
// mirar. Ahora los usa tambien la Edge Function que manda el correo, para que
// el criterio de "urgente" sea el mismo en los dos sitios.
//
// Que pasa si caduca sin que nadie se entere: las facturas dejan de poder
// firmarse y los envios a Verifactu empiezan a fallar. No es un aviso
// cosmetico.
//
// Este archivo no importa nada de Deno ni de React: lo cargan la Edge
// Function, el frontend y vitest.

const DIA_MS = 24 * 60 * 60 * 1000;

export type NivelCaducidad = 'caducado' | 'urgente' | 'aviso' | 'vigente';

export interface EstadoCaducidad {
  nivel: NivelCaducidad;
  /** Dias que faltan. Negativo si ya caduco. */
  dias: number;
  /** La fecha, ya formateada en espanol. */
  fechaTexto: string;
}

/** Medianoche UTC del dia al que pertenece un instante. */
function diaUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

/**
 * Nivel de urgencia de una fecha de caducidad.
 *
 * Devuelve null si no hay fecha o no se entiende: los certificados subidos
 * antes de que se registrara la caducidad no tienen ninguna, y eso no es un
 * error.
 *
 * Los dias se cuentan de FECHA A FECHA, no de instante a instante. Antes era
 * `Math.floor((caducidad - ahora) / un_dia)`, y eso descontaba las horas ya
 * transcurridas del dia en curso: la columna guarda una fecha, que se lee como
 * las 00:00 de ese dia, asi que un certificado con caducidad dentro de cinco
 * dias avisaba de "4 dias" si el aviso salia por la tarde. Cuanto mas tarde se
 * ejecutara la tarea, mas corta la cuenta — y uno que vence manana llegaba a
 * decir "caduca hoy". El certificado vale durante todo su ultimo dia.
 */
export function nivelDeCaducidad(iso: string | null | undefined): EstadoCaducidad | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;

  const dias = Math.round((diaUtc(fecha) - diaUtc(new Date())) / DIA_MS);
  const fechaTexto = fecha.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (dias < 0) return { nivel: 'caducado', dias, fechaTexto };
  if (dias <= 30) return { nivel: 'urgente', dias, fechaTexto };
  if (dias <= 60) return { nivel: 'aviso', dias, fechaTexto };
  return { nivel: 'vigente', dias, fechaTexto };
}

/**
 * Tramos en los que se manda un correo, de menos a mas urgente.
 *
 * Se avisa UNA vez por tramo, no todos los dias: el aviso diario se ignora a
 * la tercera y deja de servir para nada. `0` es el dia en que caduca o
 * despues.
 */
export const TRAMOS_DE_AVISO = [60, 30, 7, 0] as const;

export type TramoDeAviso = (typeof TRAMOS_DE_AVISO)[number];

/**
 * En que tramo cae un numero de dias, o null si aun no toca avisar.
 *
 * Devuelve el tramo MAS urgente que ya se ha cruzado: a 5 dias devuelve 7, no
 * 60, porque los tres anteriores ya se habran mandado.
 */
export function tramoQueCorresponde(dias: number): TramoDeAviso | null {
  if (!Number.isFinite(dias)) return null;
  for (const tramo of [...TRAMOS_DE_AVISO].sort((a, b) => a - b)) {
    if (dias <= tramo) return tramo;
  }
  return null;
}

/**
 * Si hay que mandar correo ahora mismo.
 *
 * `tramoYaAvisado` es el ultimo tramo por el que ya se aviso — null si no se
 * ha avisado nunca, o si el certificado es otro (al subir uno nuevo se borra).
 * Solo se manda cuando el tramo actual es MAS urgente que el ultimo enviado,
 * asi que cada usuario recibe como mucho cuatro correos por certificado.
 */
export function hayQueAvisar(
  dias: number,
  tramoYaAvisado: number | null | undefined
): { avisar: boolean; tramo: TramoDeAviso | null } {
  const tramo = tramoQueCorresponde(dias);
  if (tramo === null) return { avisar: false, tramo: null };
  if (tramoYaAvisado === null || tramoYaAvisado === undefined) {
    return { avisar: true, tramo };
  }
  // Tramo mas pequeno = mas urgente. Solo se avanza hacia lo urgente.
  return { avisar: tramo < tramoYaAvisado, tramo };
}
