import { describe, it, expect } from 'vitest'
import {
  STRIPE_ITEMS,
  articulo,
  esComprablePorCheckout,
} from '../../supabase/functions/_shared/catalogo-stripe'

// El catalogo vivia solo en el navegador y create-checkout-session reenviaba a
// Stripe lo que le llegara: priceId, modo, importe y metadata entero. Como el
// webhook concede plan y creditos mirando metadata.itemKey y metadata.credits,
// sin mirar cuanto se pago, se podia comprar el plan Teams por 1 centimo.

const CLAVES = Object.keys(STRIPE_ITEMS)

describe('catalogo — forma de los articulos', () => {
  it('no esta vacio', () => {
    expect(CLAVES.length).toBeGreaterThan(5)
  })

  it.each(CLAVES)('"%s" tiene modo valido y nombre', (clave) => {
    const item = articulo(clave)!
    expect(['payment', 'subscription']).toContain(item.mode)
    expect(item.name.length).toBeGreaterThan(0)
  })

  it('los price_id son de Stripe y no se repiten', () => {
    const ids = CLAVES.map((c) => articulo(c)!.priceId).filter((p): p is string => p !== null)
    ids.forEach((id) => expect(id).toMatch(/^price_[A-Za-z0-9]+$/))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('los planes son suscripcion y los paquetes pago unico', () => {
    for (const clave of CLAVES) {
      const item = articulo(clave)!
      if (clave.includes('Plan')) expect(item.mode).toBe('subscription')
      if (clave.includes('Credits')) expect(item.mode).toBe('payment')
    }
  })
})

describe('catalogo — creditos', () => {
  it('solo los paquetes de creditos declaran creditos', () => {
    for (const clave of CLAVES) {
      const item = articulo(clave)!
      const esPaquete = clave.startsWith('aiCredits') || clave.startsWith('signatureCredits')
      expect(item.credits !== undefined).toBe(esPaquete)
    }
  })

  it('la cantidad de creditos coincide con el numero del nombre de la clave', () => {
    for (const clave of CLAVES) {
      const item = articulo(clave)!
      if (item.credits === undefined) continue
      const esperado = Number(clave.match(/(\d+)$/)![1])
      expect(item.credits).toBe(esperado)
    }
  })

  it('ningun paquete concede una cantidad absurda', () => {
    for (const clave of CLAVES) {
      const c = articulo(clave)!.credits
      if (c === undefined) continue
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThanOrEqual(1000)
    }
  })
})

describe('esComprablePorCheckout — solo lo del catalogo', () => {
  it.each(['proPlan', 'teamsPlan', 'aiCredits500', 'signatureCredits25', 'featuredJobPost'])(
    'acepta "%s"',
    (clave) => {
      expect(esComprablePorCheckout(clave)).toBe(true)
    }
  )

  it('rechaza invoicePayment (va por payment-sheet, que calcula el importe)', () => {
    expect(esComprablePorCheckout('invoicePayment')).toBe(false)
  })

  it.each([
    '',
    'proPlanGratis',
    'PROPLAN',
    'aiCredits999999',
    '__proto__',
    'constructor',
    'toString',
  ])('rechaza "%s"', (clave) => {
    expect(esComprablePorCheckout(clave)).toBe(false)
  })

  it('articulo() devuelve null para claves heredadas del prototipo', () => {
    // Si se usara un acceso directo sin comprobar, 'constructor' o 'toString'
    // devolverian una funcion en vez de undefined.
    expect(articulo('constructor')).toBeNull()
    expect(articulo('toString')).toBeNull()
    expect(articulo('hasOwnProperty')).toBeNull()
  })
})
