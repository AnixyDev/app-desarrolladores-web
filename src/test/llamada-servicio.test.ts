import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { esLlamadaDelServicio } from '../../supabase/functions/_shared/llamada-servicio'

describe('esLlamadaDelServicio', () => {
  it('acepta solo la clave exacta', () => {
    expect(esLlamadaDelServicio('Bearer secreto-largo', 'secreto-largo')).toBe(true)
    expect(esLlamadaDelServicio('Bearer secreto-larga', 'secreto-largo')).toBe(false)
    expect(esLlamadaDelServicio('Bearer secreto-largo-mas', 'secreto-largo')).toBe(false)
    expect(esLlamadaDelServicio('Bearer secreto', 'secreto-largo')).toBe(false)
    expect(esLlamadaDelServicio('secreto-largo', 'secreto-largo')).toBe(false)
  })

  it('sin clave configurada no deja pasar a nadie (antes pasaba «Bearer undefined»)', () => {
    expect(esLlamadaDelServicio('Bearer undefined', undefined)).toBe(false)
    expect(esLlamadaDelServicio('Bearer ', '')).toBe(false)
    expect(esLlamadaDelServicio(null, 'x')).toBe(false)
  })

  it.each(['process-recurring-invoices', 'weekly-profitability-alert', 'certificate-expiry-alert'])(
    '%s ya no compara la clave con !==',
    (fn) => {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8')
      expect(src).toMatch(/esLlamadaDelServicio\(authHeader/)
      expect(src).not.toMatch(/!==\s*`Bearer/)
    }
  )
})

describe('revisión de seguridad del 29/09 (código de las funciones)', () => {
  const leer = (f: string) => readFileSync(`supabase/functions/${f}/index.ts`, 'utf8')

  it('bank-connect comprueba la conexión pendiente ANTES de canjear el código', () => {
    const src = leer('bank-connect')
    const i = src.indexOf(".eq('status', 'pending')")
    const j = src.indexOf('`${EB_BASE_URL}/sessions`')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(j)
    expect(src).toMatch(/instanceof ErrorVisible/)
  })

  it('bank-sync reserva el movimiento con un UPDATE condicionado antes de crear el pago', () => {
    const src = leer('bank-sync')
    const i = src.indexOf(".neq('match_status', 'confirmed')")
    const j = src.indexOf(".from('payments').insert(")
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(j)
  })

  it('invite-team-member escapa comodines y reserva el cupo antes de enviar', () => {
    const src = leer('invite-team-member')
    expect(src).not.toMatch(/\.ilike\(/)
    expect(src).toMatch(/\.toLowerCase\(\) === destinatario/)
    expect(src.indexOf('anularReserva')).toBeLessThan(src.indexOf('inviteUserByEmail(destinatario'))
  })

  it('process-recurring-invoices comprueba el dueño del cliente y del proyecto', () => {
    const src = leer('process-recurring-invoices')
    expect(src).toMatch(/dueñoDeCliente\.get\(rec\.client_id\) !== rec\.user_id/)
    expect(src).toMatch(/dueñoDeProyecto\.get\(rec\.project_id\) !== rec\.user_id/)
  })
})
