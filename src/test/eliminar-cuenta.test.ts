import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { crearZip, crc32 } from '../../lib/zip'
import { csvDeFacturas } from '../../lib/descargaFacturas'
import { confirmacionValida, hayQueCancelar } from '../../supabase/functions/_shared/eliminar-cuenta'

describe('confirmación de la baja', () => {
  it('exige el email de la cuenta, sin importar mayúsculas ni espacios', () => {
    expect(confirmacionValida('  Ana@Example.com ', 'ana@example.com')).toBe(true)
    expect(confirmacionValida('otra@example.com', 'ana@example.com')).toBe(false)
    expect(confirmacionValida('', '')).toBe(false)
    expect(confirmacionValida(undefined, 'ana@example.com')).toBe(false)
  })
})

describe('suscripciones de Stripe', () => {
  it('se cancelan las que aún pueden cobrar', () => {
    for (const s of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) expect(hayQueCancelar(s)).toBe(true)
    for (const s of ['canceled', 'incomplete_expired']) expect(hayQueCancelar(s)).toBe(false)
  })
})

describe('ZIP sin compresión', () => {
  it('crc32 conocido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('estructura válida: cabeceras, directorio central y contenido intacto', () => {
    const a = new TextEncoder().encode('%PDF-1.3 hola')
    const b = new TextEncoder().encode('Número;Total\r\n')
    const zip = crearZip([{ nombre: 'facturas/INV-1.pdf', datos: a }, { nombre: 'facturas.csv', datos: b }])
    const v = new DataView(zip.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    const fin = zip.length - 22
    expect(v.getUint32(fin, true)).toBe(0x06054b50)
    expect(v.getUint16(fin + 10, true)).toBe(2)
    const inicioCentral = v.getUint32(fin + 16, true)
    expect(v.getUint32(inicioCentral, true)).toBe(0x02014b50)
    // el primer fichero va justo tras su cabecera local
    const largoNombre = v.getUint16(26, true)
    expect(new TextDecoder().decode(zip.slice(30 + largoNombre, 30 + largoNombre + a.length))).toBe('%PDF-1.3 hola')
  })
})

describe('CSV de facturas', () => {
  it('con BOM, «;» y comillas escapadas', () => {
    const csv = csvDeFacturas(
      [{ id: 'f', client_id: 'c', invoice_number: 'INV-1', issue_date: '2026-09-01', due_date: '2026-10-01', subtotal_cents: 10000, tax_percent: 21, irpf_percent: 0, total_cents: 12100, paid: false } as any],
      () => ({ id: 'c', name: 'Acme "Pro"', tax_id: 'B1' }) as any,
    )
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Acme ""Pro"""')
    expect(csv).toContain('"121,00"')
  })
})

describe('la función eliminar-cuenta', () => {
  const src = readFileSync('supabase/functions/eliminar-cuenta/index.ts', 'utf8')
  it('cancela Stripe antes de borrar datos, y borra el usuario al final', () => {
    const stripe = src.indexOf('stripe.subscriptions.cancel')
    const datos = src.indexOf("rpc('eliminar_datos_de_cuenta'")
    const usuario = src.indexOf('auth.admin.deleteUser')
    expect(stripe).toBeGreaterThan(0)
    expect(stripe).toBeLessThan(datos)
    expect(datos).toBeLessThan(usuario)
  })
  it('si Stripe falla, no sigue', () => {
    expect(src).toMatch(/No se ha borrado nada[\s\S]*?502\)/)
  })
  it('exige confirmación y protege la cuenta de administración', () => {
    expect(src).toMatch(/confirmacionValida\(cuerpo\.confirmacion, auth\.user\.email\)/)
    expect(src).toMatch(/toLowerCase\(\) === 'admin'/)
  })
})

describe('pantallas', () => {
  it('Ajustes lleva a la página de baja y la ruta existe', () => {
    expect(readFileSync('pages/SettingsPage.tsx', 'utf8')).toMatch(/navigate\('\/cuenta\/eliminar'\)/)
    const app = readFileSync('App.tsx', 'utf8')
    expect(app).toMatch(/path="cuenta\/eliminar"/)
    expect(app).toMatch(/path="\/cuenta-eliminada"/)
  })
})
