import { describe, it, expect, vi, afterEach } from 'vitest'
import { estadoCaducidad } from '../../pages/SettingsPage'

// La fecha de caducidad del certificado digital no se guardaba ni se mostraba:
// nada avisaba de que iba a vencer, y los envios a Verifactu habrian empezado a
// fallar sin previo aviso. Estos casos fijan los umbrales del aviso.

const enDias = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString()

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
    const r = estadoCaducidad(enDias(-1))
    expect(r?.nivel).toBe('caducado')
    expect(r?.color).toBe('text-red-400')
    expect(r?.texto).toMatch(/Caducado/)
  })

  it('caduca hoy mismo cuenta como urgente, no como caducado', () => {
    const r = estadoCaducidad(enDias(0.5))
    expect(r?.nivel).toBe('urgente')
  })

  it('a 30 dias sigue siendo urgente (limite incluido)', () => {
    expect(estadoCaducidad(enDias(30.5))?.nivel).toBe('urgente')
  })

  it('a 31 dias baja a aviso', () => {
    const r = estadoCaducidad(enDias(31.5))
    expect(r?.nivel).toBe('aviso')
    expect(r?.color).toBe('text-amber-400')
  })

  it('a 60 dias sigue en aviso (limite incluido)', () => {
    expect(estadoCaducidad(enDias(60.5))?.nivel).toBe('aviso')
  })

  it('a 61 dias esta vigente y no alarma', () => {
    const r = estadoCaducidad(enDias(61.5))
    expect(r?.nivel).toBe('vigente')
    expect(r?.icono).toBe('')
    expect(r?.texto).toMatch(/Válido hasta/)
  })

  it('a un año esta vigente', () => {
    expect(estadoCaducidad(enDias(365))?.nivel).toBe('vigente')
  })
})

describe('estadoCaducidad — redaccion', () => {
  it('singular cuando queda un solo dia', () => {
    expect(estadoCaducidad(enDias(1.5))?.texto).toMatch(/en 1 día\b/)
  })

  it('plural cuando quedan varios', () => {
    expect(estadoCaducidad(enDias(5.5))?.texto).toMatch(/en 5 días\b/)
  })

  it('la fecha sale en castellano', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
    expect(estadoCaducidad('2027-03-08T10:00:00Z')?.texto).toMatch(/8 de marzo de 2027/)
  })
})
