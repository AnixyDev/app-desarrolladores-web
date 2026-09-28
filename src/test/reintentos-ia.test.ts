import { describe, it, expect, vi } from 'vitest'
import { conRespaldo, esErrorDeClave } from '../../supabase/functions/_shared/reintentos-ia'

// El 28/09 la mitad de los mensajes del asistente fallaban en producción:
// clave propia inválida (400) + modelo de respaldo saturado (503) y un único
// intento por modelo.

const CLAVE_INVALIDA = 'Gemini API error 400 (modelo A): {"message":"API key not valid. Please pass a valid API key."}'
const SATURADO = 'Gemini API error 503 (modelo B): This model is currently experiencing high demand.'
const opciones = (extra = {}) => ({
  plan: ['A', 'B', 'A', 'B'], clavePropia: 'propia', claveCompartida: 'comun',
  esperar: () => Promise.resolve(), ...extra,
})

describe('conRespaldo', () => {
  it('reproduce el fallo del 28/09 y ahora acaba respondiendo', async () => {
    const llamadas: string[] = []
    const r = await conRespaldo(opciones(), async (clave, modelo) => {
      llamadas.push(`${clave}/${modelo}`)
      if (clave === 'propia') throw new Error(CLAVE_INVALIDA)
      if (llamadas.length < 4) throw new Error(SATURADO)
      return 'ok'
    })
    expect(r).toBe('ok')
    // La clave propia inválida no gasta un paso del plan: se repite A con la compartida.
    expect(llamadas).toEqual(['propia/A', 'comun/A', 'comun/B', 'comun/A'])
  })

  it('no reintenta un error que no es pasajero', async () => {
    const llamar = vi.fn(async () => { throw new Error('Gemini API error 400: invalid argument en el esquema') })
    await expect(conRespaldo(opciones(), llamar)).rejects.toThrow(/invalid argument/)
    expect(llamar).toHaveBeenCalledTimes(1)
  })

  it('si la clave compartida es inválida, no insiste', async () => {
    const llamar = vi.fn(async () => { throw new Error(CLAVE_INVALIDA) })
    await expect(conRespaldo(opciones({ clavePropia: 'comun' }), llamar)).rejects.toThrow(/API key not valid/)
    expect(llamar).toHaveBeenCalledTimes(1)
  })

  it('agota el plan con fallos pasajeros y devuelve el último error, esperando entre intentos', async () => {
    const esperas: number[] = []
    const llamar = vi.fn(async () => { throw new Error(SATURADO) })
    await expect(conRespaldo(opciones({ clavePropia: 'comun', esperar: async (ms: number) => { esperas.push(ms) } }), llamar))
      .rejects.toThrow(/high demand/)
    expect(llamar).toHaveBeenCalledTimes(4)
    expect(esperas).toEqual([700, 1400, 2100])
  })

  it('esErrorDeClave reconoce los formatos de Google', () => {
    expect(esErrorDeClave(CLAVE_INVALIDA)).toBe(true)
    expect(esErrorDeClave('reason: API_KEY_INVALID')).toBe(true)
    expect(esErrorDeClave(SATURADO)).toBe(false)
  })
})
