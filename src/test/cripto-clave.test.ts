import { describe, it, expect } from 'vitest'
import {
  hexABytes,
  claveAes,
  cifrarTexto,
  descifrarTexto,
  bytesABase64,
  ClaveInvalidaError,
} from '../../supabase/functions/_shared/cripto'

// El fallo original: la clave hexadecimal no se validaba, asi que una errata
// (un caracter que no es hex) daba NaN, el byte se guardaba como 0 y la clave
// quedaba debilitada EN SILENCIO. Habia tres copias del mismo codigo.

const CLAVE_256 = 'a'.repeat(64)

describe('hexABytes — rechaza claves invalidas', () => {
  it('vacia', () => {
    expect(() => hexABytes('')).toThrow(ClaveInvalidaError)
    expect(() => hexABytes('   ')).toThrow(ClaveInvalidaError)
  })

  it('con caracteres no hexadecimales', () => {
    // Este es EL caso: antes se convertia en un byte 0 sin avisar.
    expect(() => hexABytes('zz'.repeat(32))).toThrow(/no es hexadecimal/)
    expect(() => hexABytes('a'.repeat(63) + 'g')).toThrow(/no es hexadecimal/)
  })

  it('con numero impar de caracteres', () => {
    expect(() => hexABytes('abc')).toThrow(ClaveInvalidaError)
  })

  it.each([8, 20, 31, 33, 40, 64])('con %i bytes (longitud no valida para AES)', (n) => {
    expect(() => hexABytes('ab'.repeat(n))).toThrow(/16, 24 o 32 bytes/)
  })
})

describe('hexABytes — acepta las longitudes de AES', () => {
  it.each([
    [16, 'AES-128'],
    [24, 'AES-192'],
    [32, 'AES-256'],
  ])('%i bytes (%s)', (n) => {
    const bytes = hexABytes('ab'.repeat(n))
    expect(bytes).toHaveLength(n)
    expect(bytes.every((b) => b === 0xab)).toBe(true)
  })

  it('no distingue mayusculas de minusculas', () => {
    expect(Array.from(hexABytes('AB'.repeat(32)))).toEqual(Array.from(hexABytes('ab'.repeat(32))))
  })

  it('ignora espacios alrededor', () => {
    expect(hexABytes(`  ${CLAVE_256}  `)).toHaveLength(32)
  })

  it('convierte los bytes correctamente', () => {
    expect(Array.from(hexABytes('00ff10' + 'ab'.repeat(13)))).toEqual([
      0, 255, 16, ...Array(13).fill(0xab),
    ])
  })
})

describe('cifrar y descifrar', () => {
  it('ida y vuelta devuelve el texto original', async () => {
    const clave = await claveAes(CLAVE_256)
    const texto = 'clave privada de Enable Banking\ncon saltos\ny acentos: ñáé'
    expect(await descifrarTexto(await cifrarTexto(texto, clave), clave)).toBe(texto)
  })

  it('cifrar dos veces da resultados distintos (IV aleatorio)', async () => {
    const clave = await claveAes(CLAVE_256)
    const a = await cifrarTexto('mismo texto', clave)
    const b = await cifrarTexto('mismo texto', clave)
    expect(a).not.toBe(b)
    expect(await descifrarTexto(a, clave)).toBe(await descifrarTexto(b, clave))
  })

  it('otra clave no puede descifrar', async () => {
    const clave = await claveAes(CLAVE_256)
    const otra = await claveAes('b'.repeat(64))
    const cifrado = await cifrarTexto('secreto', clave)
    await expect(descifrarTexto(cifrado, otra)).rejects.toThrow()
  })
})

describe('bytesABase64 — no revienta con ficheros grandes', () => {
  // btoa(String.fromCharCode(...bytes)) fallaba por encima de ~128 kB.
  it.each([1024, 128 * 1024, 512 * 1024])('%i bytes', (n) => {
    const bytes = new Uint8Array(n)
    expect(() => bytesABase64(bytes)).not.toThrow()
    expect(bytesABase64(bytes).length).toBeGreaterThan(0)
  })

  it('produce el mismo resultado que la forma directa en tamaños pequeños', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255])
    expect(bytesABase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)))
  })
})
