// Calculo de la siguiente fecha de emision de una factura recurrente.
//
// Vive en su propio archivo, sin imports de Deno ni de red, para que el test
// de vitest (src/test/fechas-recurrentes.test.ts) pueda importarlo tal cual y
// CI lo cubra. index.ts lo importa desde aqui: no hay copia duplicada.

/** Los valores del enum recurring_frequency en la base de datos. */
export type Frecuencia = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const DIAS: Record<'daily' | 'weekly', number> = { daily: 1, weekly: 7 }
const MESES: Record<'monthly' | 'quarterly' | 'yearly', number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

/**
 * Suma meses conservando el dia de anclaje y recortando al ultimo dia del mes
 * cuando ese dia no existe.
 *
 * El codigo anterior hacia `fecha.setMonth(fecha.getMonth() + 1)`, que en
 * JavaScript desborda: el 31 de enero + 1 mes da 3 de marzo, y a partir de ahi
 * la serie se desplaza sola.
 */
export function sumarMeses(fecha: Date, meses: number, diaAncla: number): Date {
  const resultado = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + meses, 1))
  const ultimoDiaDelMes = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)
  ).getUTCDate()
  resultado.setUTCDate(Math.min(diaAncla, ultimoDiaDelMes))
  return resultado
}

/**
 * Devuelve la siguiente fecha (YYYY-MM-DD) o `null` si la frecuencia no esta
 * contemplada.
 *
 * `null` es importante: quien llama NO debe emitir factura en ese caso. Si se
 * emite sin avanzar next_due_date, la tarea diaria vuelve a seleccionar la
 * misma fila manana y genera una factura nueva cada dia para siempre.
 *
 * @param actual   next_due_date actual, en formato YYYY-MM-DD
 * @param frecuencia  valor del enum recurring_frequency
 * @param anclaje  start_date, de donde sale el dia del mes de la serie
 */
export function siguienteFecha(
  actual: string,
  frecuencia: string,
  anclaje: string
): string | null {
  const base = new Date(`${actual}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null

  const f = frecuencia as Frecuencia

  if (f === 'daily' || f === 'weekly') {
    const resultado = new Date(base)
    resultado.setUTCDate(resultado.getUTCDate() + DIAS[f])
    return resultado.toISOString().split('T')[0]
  }

  if (f === 'monthly' || f === 'quarterly' || f === 'yearly') {
    // El dia de anclaje sale de start_date, no de next_due_date, para que la
    // serie no se degrade si alguna vez se recorto a un mes de 30 o 28 dias.
    const ancla = new Date(`${anclaje}T00:00:00Z`)
    const diaAncla = Number.isNaN(ancla.getTime()) ? base.getUTCDate() : ancla.getUTCDate()
    return sumarMeses(base, MESES[f], diaAncla).toISOString().split('T')[0]
  }

  return null
}
