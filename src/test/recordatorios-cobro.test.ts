import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nivelQueToca, rellenarPlantilla, correoDeRecordatorio } from '../../supabase/functions/_shared/recordatorios-cobro'

const f = (vencimiento: string, hoy: string, yaEnviados: number[] = [], emision = '2026-09-01') =>
  nivelQueToca({ emision, vencimiento, hoy, yaEnviados })

describe('nivelQueToca', () => {
  it('3 días antes de vencer, solo si se emitió con margen', () => {
    expect(f('2026-10-10', '2026-10-07')).toBe(-3)
    expect(f('2026-10-10', '2026-10-09')).toBe(-3)          // sigue dentro de los 3 días
    expect(f('2026-10-10', '2026-10-06')).toBeNull()        // aún pronto
    expect(f('2026-10-10', '2026-10-07', [], '2026-10-06')).toBeNull() // emitida con 4 días de margen
  })

  it('el día del vencimiento y los dos siguientes no se manda nada', () => {
    expect(f('2026-10-10', '2026-10-10', [-3])).toBeNull()
    expect(f('2026-10-10', '2026-10-12', [-3])).toBeNull()
  })

  it('a los 3, 15 y 30 días, una vez cada uno', () => {
    expect(f('2026-10-10', '2026-10-13', [-3])).toBe(3)
    expect(f('2026-10-10', '2026-10-14', [-3, 3])).toBeNull()
    expect(f('2026-10-10', '2026-10-25', [-3, 3])).toBe(15)
    expect(f('2026-10-10', '2026-11-09', [-3, 3, 15])).toBe(30)
    expect(f('2026-10-10', '2026-11-20', [-3, 3, 15, 30])).toBeNull()
  })

  it('si se activa tarde, solo sale el nivel más alto (no tres correos de golpe)', () => {
    expect(f('2026-08-01', '2026-09-30', [])).toBe(30)
  })

  it('más de 120 días vencida: ya no se recuerda', () => {
    expect(f('2026-05-01', '2026-09-30', [])).toBeNull()
  })
})

describe('plantilla', () => {
  const datos = { cliente: 'Acme <S.L.>', numero: 'INV-7', pendienteCents: 121000, vencimiento: '2026-10-10' }

  it('rellena los marcadores en inglés y en español', () => {
    const t = rellenarPlantilla('[ClientName] · {numero} · [Amount] · {fecha}', datos)
    expect(t).toContain('Acme &lt;S.L.&gt;')
    expect(t).toContain('INV-7')
    expect(t).toMatch(/1\.?210,00\s€/)
    expect(t).toContain('10 de octubre de 2026')
  })

  it('escapa el HTML del usuario y quita enlaces', () => {
    const t = rellenarPlantilla('Paga aquí <b>ya</b> https://phishing.example/x o www.malo.com', datos)
    expect(t).not.toMatch(/<b>|phishing|www\.malo/)
    expect(t).toContain('&lt;b&gt;')
  })
})

describe('correoDeRecordatorio', () => {
  const base = { cliente: 'Acme', numero: 'INV-7', pendienteCents: 5000, vencimiento: '2026-10-10', firma: 'Anixy Dev' }

  it('asunto según el nivel y plantilla por defecto si no hay', () => {
    expect(correoDeRecordatorio({ ...base, nivel: -3 }).asunto).toMatch(/vence en 3 días/)
    expect(correoDeRecordatorio({ ...base, nivel: 15 }).asunto).toMatch(/^Segundo recordatorio/)
    expect(correoDeRecordatorio({ ...base, nivel: 30 }).asunto).toMatch(/^Último recordatorio/)
    expect(correoDeRecordatorio({ ...base, nivel: 3, plantillaVencida: '  ' }).html).toContain('todavía figura como pendiente')
  })

  it('enlace de pago solo si se pasa', () => {
    expect(correoDeRecordatorio({ ...base, nivel: 3 }).html).not.toContain('/pay/')
    expect(correoDeRecordatorio({ ...base, nivel: 3, enlacePago: 'https://devfreelancer.app/pay/abc' }).html).toContain('https://devfreelancer.app/pay/abc')
  })
})

describe('la función de envío', () => {
  const src = readFileSync('supabase/functions/recordatorios-cobro/index.ts', 'utf8')
  it('solo la lanza el cron con la clave de servicio', () => {
    expect(src).toMatch(/esLlamadaDelServicio\(req\.headers\.get\('Authorization'\)/)
  })
  it('apunta el nivel ANTES de enviar y lo borra si falla', () => {
    expect(src.indexOf(".from('recordatorios_cobro_enviados')\n          .insert(")).toBeLessThan(src.indexOf('enviarPorResend(claveEnvio'))
    expect(src).toMatch(/delete\(\)\.eq\('invoice_id', f\.id\)\.eq\('nivel', nivel\)/)
  })
  it('respeta el interruptor general y el de cada factura, y solo escribe a clientes propios', () => {
    expect(src).toMatch(/\.eq\('payment_reminders_enabled', true\)/)
    expect(src).toMatch(/\.eq\('recordatorios_activos', true\)/)
    expect(src).toMatch(/c\.user_id === u\.id/)
  })
})
