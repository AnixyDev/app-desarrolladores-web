import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { estadoCaducidad } from '../../pages/SettingsPage'

// La fecha de caducidad del certificado digital no se guardaba ni se mostraba:
// nada avisaba de que iba a vencer, y los envios a Verifactu habrian empezado a
// fallar sin previo aviso. Estos casos fijan los umbrales del aviso.
//
// Todo se ejecuta con el reloj congelado. Antes estos casos usaban medios dias
// (30.5, 1.5...) para esquivar el truncado de la cuenta anterior; ahora los
// dias se cuentan de fecha a fecha, asi que las fechas pueden ser exactas y el
// resultado no depende de la hora a la que se lancen las pruebas.

const AHORA = '2026-09-24T20:25:00Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(AHORA))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('estadoCaducidad — umbrales', () => {
  it('sin fecha devuelve null (certificados subidos antes de este cambio)', () => {
    expect(estadoCaducidad(null)).toBeNull()
    expect(estadoCaducidad(undefined)).toBeNull()
    expect(estadoCaducidad('')).toBeNull()
  })

  it('una fecha ilegible devuelve null en vez de romper la pagina', () => {
    expect(estadoCaducidad('no-soy-una-fecha')).toBeNull()
  })

  it('ya caducado', () => {
    const r = estadoCaducidad('2026-09-23')
    expect(r?.nivel).toBe('caducado')
    expect(r?.color).toBe('text-red-400')
    expect(r?.texto).toMatch(/Caducado/)
  })

  it('caduca hoy mismo cuenta como urgente, no como caducado', () => {
    // Vale durante todo el dia de hoy: mientras no pase la medianoche, sirve.
    const r = estadoCaducidad('2026-09-24')
    expect(r?.nivel).toBe('urgente')
  })

  it('a 30 dias sigue siendo urgente (limite incluido)', () => {
    expect(estadoCaducidad('2026-10-24')?.nivel).toBe('urgente')
  })

  it('a 31 dias baja a aviso', () => {
    const r = estadoCaducidad('2026-10-25')
    expect(r?.nivel).toBe('aviso')
    expect(r?.color).toBe('text-amber-400')
  })

  it('a 60 dias sigue en aviso (limite incluido)', () => {
    expect(estadoCaducidad('2026-11-23')?.nivel).toBe('aviso')
  })

  it('a 61 dias esta vigente y no alarma', () => {
    const r = estadoCaducidad('2026-11-24')
    expect(r?.nivel).toBe('vigente')
    expect(r?.icono).toBe('')
    expect(r?.texto).toMatch(/Válido hasta/)
  })

  it('a un año esta vigente', () => {
    expect(estadoCaducidad('2027-09-24')?.nivel).toBe('vigente')
  })
})

describe('estadoCaducidad — los dias se cuentan de fecha a fecha', () => {
  // El fallo que lo destapo: el primer correo real decia "caduca en 4 dias"
  // para un certificado puesto a 5 dias vista. La columna guarda una fecha,
  // que se lee como las 00:00 de ese dia; con la cuenta anterior, a las 20:25
  // ya se habian "gastado" 20 horas del primer dia y el truncado se las comia.

  it('cinco dias de calendario son cinco dias, no cuatro', () => {
    // Son las 20:25 del 24. El certificado vence el 29.
    expect(estadoCaducidad('2026-09-29')?.texto).toMatch(/en 5 días\b/)
  })

  it('el resultado no cambia segun la hora del dia', () => {
    for (const hora of ['00:01', '08:00', '13:37', '23:59']) {
      vi.setSystemTime(new Date(`2026-09-24T${hora}:00Z`))
      expect(estadoCaducidad('2026-09-29')?.texto).toMatch(/en 5 días\b/)
    }
  })

  it('el que vence manana dice manana, no hoy', () => {
    vi.setSystemTime(new Date('2026-09-24T23:50:00Z'))
    expect(estadoCaducidad('2026-09-25')?.texto).toMatch(/en 1 día\b/)
  })
})

describe('estadoCaducidad — redaccion', () => {
  it('singular cuando queda un solo dia', () => {
    expect(estadoCaducidad('2026-09-25')?.texto).toMatch(/en 1 día\b/)
  })

  it('plural cuando quedan varios', () => {
    expect(estadoCaducidad('2026-09-29')?.texto).toMatch(/en 5 días\b/)
  })

  it('la fecha sale en castellano', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    expect(estadoCaducidad('2027-03-08T10:00:00Z')?.texto).toMatch(/8 de marzo de 2027/)
  })
})
