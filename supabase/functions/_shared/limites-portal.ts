// Límites de las invitaciones al Portal de Cliente.
//
// Vive aquí, en `_shared`, porque lo importan las dos partes: la Edge Function
// `invite-portal-client`, que es quien decide de verdad, y la ficha del cliente
// en el navegador, que solo lo usa para explicar por qué un botón está
// apagado. Si cada lado tuviera su copia, acabarían diciendo cosas distintas
// — que es el patrón que destapó media auditoría.
//
// Lo que se protege: el correo sale del dominio verificado de la aplicación.
// Sin tope, una cuenta podría usar la lista de clientes como lanzadera de
// correo, y quien lo hiciera quemaría la reputación de devfreelancer.app para
// todos los demás.

/** Invitaciones al portal que puede enviar una cuenta cada 24 horas. */
export const INVITACIONES_PORTAL_POR_DIA = 20;

/**
 * Espera mínima antes de volver a invitar al MISMO cliente.
 *
 * El tope diario cuenta clientes distintos, así que sin esto se podría
 * bombardear una sola dirección pulsando el botón sin parar y el contador
 * diario no se movería: la fila se actualiza, no se añade.
 */
export const ESPERA_ENTRE_REENVIOS_MINUTOS = 10;

const MINUTO_MS = 60 * 1000;

export interface Veredicto {
  permitida: boolean;
  /** Vacío si `permitida`. Se le enseña tal cual al usuario. */
  motivo: string;
}

const SI: Veredicto = { permitida: true, motivo: '' };

/**
 * ¿Se puede enviar esta invitación al portal?
 *
 * @param invitadosHoy      clientes distintos ya invitados en las últimas 24 h
 * @param ultimaInvitacion  cuándo se invitó a ESTE cliente (null si nunca)
 * @param ahora             reloj, inyectado para que las pruebas no dependan
 *                          de la hora a la que se lancen
 */
export function puedeInvitarAlPortal(
  invitadosHoy: number,
  ultimaInvitacion: Date | string | null,
  ahora: Date = new Date(),
): Veredicto {
  if (ultimaInvitacion !== null) {
    const previa = ultimaInvitacion instanceof Date
      ? ultimaInvitacion
      : new Date(ultimaInvitacion);

    // Una fecha ilegible se trata como "nunca": es mejor dejar invitar que
    // bloquear a alguien para siempre por un dato corrupto. El tope diario
    // sigue puesto.
    if (!Number.isNaN(previa.getTime())) {
      const minutos = (ahora.getTime() - previa.getTime()) / MINUTO_MS;

      // Una fecha en el futuro (reloj torcido) no debe abrir la puerta.
      if (minutos < ESPERA_ENTRE_REENVIOS_MINUTOS) {
        return {
          permitida: false,
          motivo: `Ya le has enviado la invitación hace un momento. Espera ${ESPERA_ENTRE_REENVIOS_MINUTOS} minutos antes de reenviarla.`,
        };
      }
    }
  }

  if (invitadosHoy >= INVITACIONES_PORTAL_POR_DIA) {
    return {
      permitida: false,
      motivo: `Has alcanzado el máximo de ${INVITACIONES_PORTAL_POR_DIA} invitaciones al portal en 24 horas. Inténtalo mañana.`,
    };
  }

  return SI;
}
