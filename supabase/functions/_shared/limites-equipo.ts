// Cuantos miembros de equipo permite cada plan — UNICA fuente de verdad.
//
// `invite-team-member` no comprobaba NADA: ni el plan, ni un tope, ni que la
// direccion invitada tuviera algo que ver con el usuario. Con una sesion
// valida se podian disparar invitaciones ilimitadas a direcciones arbitrarias,
// enviadas por Supabase Auth a traves de la cuenta de Resend y del dominio
// verificado devfreelancer.app. Quien lo usara para mandar basura quemaba la
// reputacion del dominio, no la suya.
//
// El limite de 5 no es inventado: la pagina de precios ya vende "Hasta 5
// miembros de equipo" como caracteristica del plan Teams.
//
// Este archivo no importa nada de Deno ni de la red: lo cargan la Edge
// Function, el frontend y vitest.

/** Miembros de equipo que puede tener cada plan, invitaciones pendientes incluidas. */
export const MIEMBROS_POR_PLAN = {
  Free: 0,
  Pro: 0,
  Teams: 5,
} as const;

export type PlanConocido = keyof typeof MIEMBROS_POR_PLAN;

/**
 * Invitaciones que un usuario puede ENVIAR en 24 horas.
 *
 * El limite por plan cuenta filas de `team_members`, y esas filas se pueden
 * borrar: sin este tope, bastaria con anadir, invitar, borrar y repetir para
 * mandar correos sin fin. Por eso cada envio se registra aparte.
 *
 * 20 es holgado para el uso normal (montar un equipo de 5, con erratas y
 * reenvios, no llega ni de lejos) y corta el abuso en seco.
 */
export const INVITACIONES_POR_DIA = 20;

const PROPIA = Object.prototype.hasOwnProperty;

/** Cuantos miembros permite ese plan. Un plan desconocido no permite ninguno. */
export function limiteDeMiembros(plan: unknown): number {
  if (typeof plan !== 'string' || !PROPIA.call(MIEMBROS_POR_PLAN, plan)) {
    return MIEMBROS_POR_PLAN.Free;
  }
  return MIEMBROS_POR_PLAN[plan as PlanConocido];
}

export interface ResultadoInvitacion {
  permitida: boolean;
  /** Mensaje para el usuario. Vacio si la invitacion puede seguir adelante. */
  motivo: string;
}

/**
 * Decide si un usuario puede invitar a una persona mas.
 *
 * `miembrosActuales` incluye las invitaciones pendientes: una plaza reservada
 * es una plaza ocupada, o bastaria con dejar invitaciones sin aceptar para
 * saltarse el limite.
 */
export function puedeInvitar(
  plan: unknown,
  miembrosActuales: number,
  enviadasHoy = 0
): ResultadoInvitacion {
  if (enviadasHoy >= INVITACIONES_POR_DIA) {
    return {
      permitida: false,
      motivo: `Has alcanzado el limite de ${INVITACIONES_POR_DIA} invitaciones en 24 horas. Intentalo manana.`,
    };
  }

  const limite = limiteDeMiembros(plan);

  if (limite === 0) {
    return {
      permitida: false,
      motivo: 'Los miembros de equipo son una funcion del plan Teams. Actualiza tu plan para invitar a tu equipo.',
    };
  }

  if (miembrosActuales >= limite) {
    return {
      permitida: false,
      motivo: `Tu plan permite hasta ${limite} miembros de equipo y ya tienes ${miembrosActuales}. Elimina a alguien del equipo para invitar a otra persona.`,
    };
  }

  return { permitida: true, motivo: '' };
}
