import { describe, it, expect } from 'vitest'
import { siguienteFecha } from '../../supabase/functions/process-recurring-invoices/fechas'

// Estos casos cubren el fallo que tenia process-recurring-invoices: la tarea
// corre a diario (pg_cron, 05:00 UTC) y si next_due_date no avanza, vuelve a
// emitir la misma factura manana, y pasado, indefinidamente.

describe('siguienteFecha — frecuencias no contempladas', () => {
  // El enum recurring_frequency permite daily, weekly, monthly, quarterly y
  // yearly. El codigo viejo solo avanzaba monthly y yearly: las otras tres
  // dejaban la fecha intacta y generaban una factura CADA DIA.
  it.each(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])(
    'avanza la fecha para "%s"',
    (frecuencia) => {
      const resultado = siguienteFecha('2026-09-23', frecuencia, '2026-09-23')
      expect(resultado).not.toBeNull()
      expect(resultado! > '2026-09-23').toBe(true)
    }
  )

  it.each(['', 'trimestral', 'bimonthly', 'MONTHLY', 'null'])(
    'devuelve null para "%s" en vez de dejar la fecha quieta',
    (frecuencia) => {
      expect(siguienteFecha('2026-09-23', frecuencia, '2026-09-23')).toBeNull()
    }
  )
})

describe('siguienteFecha — no desborda de mes', () => {
  it('31 de enero + 1 mes es 28 de febrero, no 3 de marzo', () => {
    expect(siguienteFecha('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28')
  })

  it('recupera el dia 31 tras recortarlo en febrero', () => {
    expect(siguienteFecha('2026-02-28', 'monthly', '2026-01-31')).toBe('2026-03-31')
  })

  it('recorta a 30 en los meses de 30 dias', () => {
    expect(siguienteFecha('2026-03-31', 'monthly', '2026-01-31')).toBe('2026-04-30')
  })

  it('usa el 29 en febrero de un año bisiesto', () => {
    expect(siguienteFecha('2028-01-31', 'monthly', '2028-01-31')).toBe('2028-02-29')
  })

  it('una serie mensual del dia 31 no se desplaza en 12 meses', () => {
    let fecha = '2026-01-31'
    const dias = new Set<string>()
    for (let i = 0; i < 12; i++) {
      fecha = siguienteFecha(fecha, 'monthly', '2026-01-31')!
      dias.add(fecha.split('-')[2])
    }
    // Solo dias de fin de mes. Con el fallo viejo aparecia un "03".
    expect([...dias].sort()).toEqual(['28', '30', '31'])
    expect(fecha).toBe('2027-01-31')
  })
})

describe('siguienteFecha — cruces de año y trimestres', () => {
  it('diciembre + 1 mes cruza a enero del año siguiente', () => {
    expect(siguienteFecha('2026-12-15', 'monthly', '2026-01-15')).toBe('2027-01-15')
  })

  it('quarterly suma tres meses y recorta', () => {
    expect(siguienteFecha('2026-11-30', 'quarterly', '2026-05-31')).toBe('2027-02-28')
  })

  it('yearly desde un 29 de febrero cae en el 28 del año no bisiesto', () => {
    expect(siguienteFecha('2028-02-29', 'yearly', '2024-02-29')).toBe('2029-02-28')
  })

  it('daily cruza el fin de año', () => {
    expect(siguienteFecha('2026-12-31', 'daily', '2026-01-01')).toBe('2027-01-01')
  })

  it('weekly cruza el fin de mes', () => {
    expect(siguienteFecha('2026-09-30', 'weekly', '2026-09-02')).toBe('2026-10-07')
  })
})

describe('siguienteFecha — entradas invalidas', () => {
  it('devuelve null si la fecha actual no es una fecha', () => {
    expect(siguienteFecha('no-soy-una-fecha', 'monthly', '2026-01-01')).toBeNull()
  })

  it('si el anclaje es invalido usa el dia de la fecha actual', () => {
    expect(siguienteFecha('2026-01-15', 'monthly', 'basura')).toBe('2026-02-15')
  })
})
