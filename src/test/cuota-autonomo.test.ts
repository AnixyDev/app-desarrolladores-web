import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ultimoDiaHabil, importeDelMes, proximoCargo, cargosFuturos, pagadoEnElAnio } from '../../lib/cuotaAutonomo'
import { calcularPrevision } from '../../lib/prevision'

const tramos = [
  { desde: '2027-02-01', importe_cents: 8000 },   // tarifa plana
  { desde: '2028-02-01', importe_cents: 29400 },  // cuota normal
]

describe('cuota de autónomo — cálculos', () => {
  it('último día hábil del mes (misma regla que la función SQL)', () => {
    expect(ultimoDiaHabil('2026-10-01')).toBe('2026-10-30') // 31 sábado
    expect(ultimoDiaHabil('2026-05-10')).toBe('2026-05-29') // 31 domingo
    expect(ultimoDiaHabil('2026-09-01')).toBe('2026-09-30')
    expect(ultimoDiaHabil('2027-02-01')).toBe('2027-02-26') // 28 domingo
  })

  it('importe vigente según el histórico', () => {
    expect(importeDelMes(tramos, '2027-01-01')).toBe(0)
    expect(importeDelMes(tramos, '2027-06-15')).toBe(8000)
    expect(importeDelMes(tramos, '2028-02-01')).toBe(29400)
    expect(importeDelMes([...tramos, { desde: '2029-01-01', importe_cents: 0 }], '2029-03-01')).toBe(0) // baja
  })

  it('próximo cargo: salta los meses sin cuota', () => {
    expect(proximoCargo(tramos, '2026-09-29')).toEqual({ fecha: '2027-02-26', importe_cents: 8000 })
    expect(proximoCargo([{ desde: '2026-09-01', importe_cents: 29400 }], '2026-09-29')).toEqual({ fecha: '2026-09-30', importe_cents: 29400 })
    expect(proximoCargo([], '2026-09-29')).toBeNull()
  })

  it('cargos futuros hasta una fecha', () => {
    const c = cargosFuturos([{ desde: '2026-01-01', importe_cents: 29400 }], '2026-10-31', '2026-12-31')
    // Octubre ya pasó (se cargó el 30): noviembre y diciembre.
    expect(c.map(x => x.fecha)).toEqual(['2026-11-30', '2026-12-31'])
  })

  it('pagado en el año: solo los gastos marcados como cuota', () => {
    expect(pagadoEnElAnio([
      { amount_cents: 8000, date: '2027-02-26', cuota_autonomo_mes: '2027-02-01' },
      { amount_cents: 8000, date: '2027-03-31', cuota_autonomo_mes: '2027-03-01' },
      { amount_cents: 5000, date: '2027-03-10', cuota_autonomo_mes: null },
      { amount_cents: 8000, date: '2026-12-31', cuota_autonomo_mes: '2026-12-01' },
    ], '2027')).toBe(16000)
  })
})

describe('cuota de autónomo en la previsión', () => {
  const base = {
    hoy: '2026-09-29', meses: 3, facturas: [], cobradoPorFactura: {}, recurrentes: [], gastosRecurrentes: [],
    presupuestosSinFacturar: [], incluirPresupuestos: false, saldoInicialCents: 0,
  }

  it('se suma cada mes y no entra en la media de gastos variables', () => {
    const r = calcularPrevision({
      ...base,
      cuotasAutonomo: [{ desde: '2026-06-01', importe_cents: 29400 }],
      gastos: [
        { amount_cents: 29400, date: '2026-06-30', tax_percent: 0, cuota_autonomo_mes: '2026-06-01' },
        { amount_cents: 29400, date: '2026-07-31', tax_percent: 0, cuota_autonomo_mes: '2026-07-01' },
        { amount_cents: 29400, date: '2026-08-31', tax_percent: 0, cuota_autonomo_mes: '2026-08-01' },
        { amount_cents: 9000, date: '2026-07-10', tax_percent: 21 },
      ],
    })
    expect(r.meses.map(m => m.porTipo['cuota-autonomo'])).toEqual([-29400, -29400, -29400])
    expect(r.mediaGastosVariablesCents).toBe(3000) // 9000 / 3, sin las cuotas
  })

  it('un mes ya apuntado por el servidor no se cuenta dos veces', () => {
    const r = calcularPrevision({
      ...base, hoy: '2026-09-30',
      cuotasAutonomo: [{ desde: '2026-06-01', importe_cents: 29400 }],
      gastos: [{ amount_cents: 29400, date: '2026-09-30', tax_percent: 0, cuota_autonomo_mes: '2026-09-01' }],
    })
    expect(r.meses[0].porTipo['cuota-autonomo']).toBe(0)
  })
})

describe('la pantalla de gastos incluye la cuota', () => {
  it('ExpensesPage monta la tarjeta y marca los gastos de cuota', () => {
    const src = readFileSync('pages/ExpensesPage.tsx', 'utf8')
    expect(src).toMatch(/<CuotaAutonomoCard \/>/)
    expect(src).toMatch(/expense\.cuota_autonomo_mes &&/)
  })
})
