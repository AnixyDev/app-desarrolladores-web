import { describe, it, expect } from 'vitest'
import { calcularPrevision, mesesDesde, plazoDel303, type EntradaPrevision } from '../../lib/prevision'

const base = (extra: Partial<EntradaPrevision> = {}): EntradaPrevision => ({
  hoy: '2026-09-29',
  meses: 3,
  facturas: [],
  cobradoPorFactura: {},
  recurrentes: [],
  gastosRecurrentes: [],
  gastos: [],
  presupuestosSinFacturar: [],
  incluirPresupuestos: true,
  saldoInicialCents: 0,
  ...extra,
})

const factura = (id: string, due: string, total: number, extra = {}) => ({
  id, invoice_number: `INV-${id}`, client_id: 'c1', issue_date: '2026-09-01', due_date: due,
  subtotal_cents: Math.round(total / 1.21), tax_percent: 21, total_cents: total, paid: false, ...extra,
})

describe('utilidades', () => {
  it('mesesDesde cruza el año', () => {
    expect(mesesDesde('2026-11-15', 3)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('plazos del 303: día 20, y 30 de enero para el 4T', () => {
    expect(plazoDel303(2026, 3)).toBe('2026-10-20')
    expect(plazoDel303(2026, 4)).toBe('2027-01-30')
    expect(plazoDel303(2027, 1)).toBe('2027-04-20')
  })
})

describe('calcularPrevision', () => {
  it('facturas: lo pendiente en su vencimiento, las vencidas en el mes en curso, las pagadas fuera', () => {
    const r = calcularPrevision(base({
      facturas: [
        factura('a', '2026-08-15', 12100),
        factura('b', '2026-10-10', 60500),
        factura('c', '2026-10-10', 99999, { paid: true }),
        factura('d', '2027-05-01', 5000), // fuera del horizonte
      ],
      cobradoPorFactura: { b: 10500 },
    }))
    expect(r.vencidas).toEqual({ cantidad: 1, totalCents: 12100 })
    expect(r.meses[0].porTipo.vencida).toBe(12100)
    expect(r.meses[1].porTipo.factura).toBe(50000) // 60500 - 10500 ya cobrado
    expect(r.totalCobros).toBe(62100)
  })

  it('recurrentes: se cobran 30 días después de emitirse', () => {
    const r = calcularPrevision(base({
      recurrentes: [{ id: 'r', client_id: 'c1', items: [{ description: 'Mant.', quantity: 1, price_cents: 10000 }], tax_percent: 21, frequency: 'monthly', start_date: '2026-01-05', next_due_date: '2026-10-05' }],
    }))
    // Meses: sep (en curso), oct, nov. Emisiones 5/10 y 5/11 → cobros 4/11
    // (dentro) y 5/12 (fuera del horizonte).
    expect(r.meses.map(m => m.mes)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(r.meses.map(m => m.porTipo.recurrente)).toEqual([0, 0, 12100])
  })

  it('presupuestos aceptados solo si se piden, a mitad del mes siguiente', () => {
    const p = [{ id: 'p', amount_cents: 300000, description: 'Tienda online' }]
    expect(calcularPrevision(base({ presupuestosSinFacturar: p })).meses[1].porTipo.presupuesto).toBe(300000)
    expect(calcularPrevision(base({ presupuestosSinFacturar: p, incluirPresupuestos: false })).totalCobros).toBe(0)
  })

  it('gastos recurrentes: las fechas pasadas se saltan', () => {
    const r = calcularPrevision(base({
      gastosRecurrentes: [{ id: 'g', amount_cents: 2000, frequency: 'monthly', start_date: '2026-01-10', next_date: '2026-01-10', description: 'Hosting' }],
    }))
    expect(r.meses.map(m => m.porTipo['gasto-recurrente'])).toEqual([0, -2000, -2000])
  })

  it('gastos variables: media de los 3 meses anteriores, prorrateada en el mes en curso', () => {
    const r = calcularPrevision(base({
      gastos: [
        { amount_cents: 30000, date: '2026-06-10', tax_percent: 0 },
        { amount_cents: 30000, date: '2026-07-10', tax_percent: 0 },
        { amount_cents: 30000, date: '2026-08-10', tax_percent: 0 },
        { amount_cents: 99999, date: '2026-05-10', tax_percent: 0 }, // fuera de la media
      ],
    }))
    expect(r.mediaGastosVariablesCents).toBe(30000)
    expect(r.meses[0].porTipo['gastos-variables']).toBe(-2000) // quedan 2 de 30 días
    expect(r.meses[1].porTipo['gastos-variables']).toBe(-30000)
  })

  it('IVA del 3T: repercutido menos soportado, a pagar el 20 de octubre', () => {
    const r = calcularPrevision(base({
      facturas: [factura('x', '2026-08-01', 121000, { paid: true, subtotal_cents: 100000, issue_date: '2026-08-01' })],
      gastos: [{ amount_cents: 10000, date: '2026-07-15', tax_percent: 21 }],
    }))
    const iva = r.movimientos.find(m => m.tipo === 'iva')!
    expect(iva.fecha).toBe('2026-10-20')
    expect(iva.importeCents).toBe(-(21000 - 2100))
  })

  it('saldo acumulado y meses en negativo', () => {
    const r = calcularPrevision(base({
      saldoInicialCents: 5000,
      gastosRecurrentes: [{ id: 'g', amount_cents: 4000, frequency: 'monthly', start_date: '2026-10-01', next_date: '2026-10-01', description: 'Alquiler' }],
    }))
    expect(r.meses.map(m => m.saldo)).toEqual([5000, 1000, -3000])
    expect(r.mesesEnNegativo).toEqual(['nov 2026'])
    expect(r.saldoMinimo).toEqual({ mes: 'nov 2026', saldo: -3000 })
  })
})
