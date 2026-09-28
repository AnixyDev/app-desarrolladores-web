import { describe, it, expect } from 'vitest'
import {
  resumenDelNegocio, instruccionesDelAsistente, tituloDeConversacion,
  sanearConceptos, sanearAnalisis, sanearOrden, type DatosDelNegocio,
} from '../../supabase/functions/_shared/asistente-ia'
import { costeDe } from '../../supabase/functions/_shared/creditos-ia'
import { markdownAHtml } from '../../components/ui/Markdown'

const base: DatosDelNegocio = {
  hoy: '2026-09-28',
  nombre: 'Ana López',
  negocio: 'Anixy Dev',
  plan: 'Pro',
  tarifaHoraCents: 4500,
  facturas: [
    { numero: 'INV-2026-0001', cliente: 'Acme', totalCents: 121000, pagada: true, emision: '2026-02-01', vencimiento: '2026-03-01' },
    { numero: 'INV-2026-0002', cliente: 'Acme', totalCents: 60500, pagada: false, emision: '2026-08-01', vencimiento: '2026-08-31' },
    { numero: 'INV-2026-0003', cliente: 'Beta SL', totalCents: 30000, pagada: false, emision: '2026-09-20', vencimiento: '2026-10-20' },
    { numero: 'INV-2025-0009', cliente: 'Vieja', totalCents: 99900, pagada: true, emision: '2025-12-01', vencimiento: '2025-12-31' },
  ],
  gastosCents: [{ importe: 5000, fecha: '2026-05-01' }, { importe: 9999, fecha: '2025-05-01' }],
  proyectos: [
    { nombre: 'Web Acme', cliente: 'Acme', estado: 'in-progress', entrega: '2026-09-01', presupuestoCents: 300000 },
    { nombre: 'App Beta', cliente: 'Beta SL', estado: 'planning', entrega: null },
    { nombre: 'Cerrado', cliente: 'Acme', estado: 'completed' },
  ],
  clientes: ['Acme', 'Beta SL'],
  presupuestosPendientes: 2,
  propuestasAbiertas: 1,
  contratosSinFirmar: 3,
}

describe('resumenDelNegocio', () => {
  const t = resumenDelNegocio(base)

  it('cuenta solo las facturas del año en curso', () => {
    expect(t).toMatch(/Facturación 2026: 3 facturas/)
    expect(t).toMatch(/2\.?115,00\s€ facturado/)
    expect(t).toMatch(/1\.?210,00\s€ cobrado/)
    expect(t).toMatch(/Gastos 2026: 50,00\s€/)
  })

  it('lista las vencidas y no las que aún están en plazo', () => {
    expect(t).toContain('INV-2026-0002 · Acme')
    expect(t).toContain('venció el 2026-08-31')
    expect(t).not.toContain('INV-2026-0003 · Beta SL · 300,00')
    expect(t).toMatch(/Pendiente de cobro: 2 facturas/)
  })

  it('marca los proyectos activos con retraso y omite los terminados', () => {
    expect(t).toContain('Web Acme · Acme · en curso · entrega 2026-09-01 (con retraso)')
    expect(t).toContain('App Beta · Beta SL · planificación')
    expect(t).not.toContain('Cerrado')
  })

  it('incluye contadores y tarifa, sin datos de contacto', () => {
    expect(t).toContain('Presupuestos pendientes de respuesta: 2. Propuestas abiertas: 1. Contratos sin firmar: 3.')
    expect(t).toMatch(/Tarifa por hora: 45,00\s€/)
    expect(t).not.toMatch(/@|\bNIF\b|tel[eé]fono/)
  })

  it('funciona con una cuenta vacía', () => {
    const vacio = resumenDelNegocio({ ...base, facturas: [], gastosCents: [], proyectos: [], clientes: [], tarifaHoraCents: null, negocio: null, plan: null })
    expect(vacio).toContain('No hay facturas vencidas sin cobrar.')
    expect(vacio).toContain('- Ninguno.')
    expect(vacio).toContain('Plan: Free')
    expect(vacio).toContain('Sin tarifa por hora configurada.')
  })
})

describe('instruccionesDelAsistente', () => {
  it('pone el contexto al final y exige español', () => {
    const s = instruccionesDelAsistente('CONTEXTO-X')
    expect(s.endsWith('CONTEXTO-X')).toBe(true)
    expect(s).toContain('español de España')
    expect(s).toContain('No inventes datos')
  })
})

describe('tituloDeConversacion', () => {
  it('recorta a 60 caracteres con puntos suspensivos', () => {
    const t = tituloDeConversacion('a'.repeat(100))
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.endsWith('…')).toBe(true)
  })
  it('normaliza espacios y da un título por defecto', () => {
    expect(tituloDeConversacion('  ¿Cuánto   cobro\n por hora? ')).toBe('¿Cuánto cobro por hora?')
    expect(tituloDeConversacion('   ')).toBe('Nueva conversación')
  })
})

describe('sanearConceptos', () => {
  it('usa las horas con la tarifa del usuario', () => {
    const r = sanearConceptos('{"conceptos":[{"description":"Diseño","hours":3}]}', 4500)
    expect(r).toEqual([{ description: 'Diseño', quantity: 3, price_cents: 4500 }])
  })
  it('acepta precio fijo, bloques ```json y descarta líneas vacías', () => {
    const r = sanearConceptos('```json\n[{"description":"Hosting","quantity":1,"price_cents":12000},{"description":""}]\n```', 0)
    expect(r).toEqual([{ description: 'Hosting', quantity: 1, price_cents: 12000 }])
  })
  it('limita a 10 líneas', () => {
    const muchas = JSON.stringify({ conceptos: Array.from({ length: 15 }, (_, i) => ({ description: `L${i}`, hours: 1 })) })
    expect(sanearConceptos(muchas, 1000)).toHaveLength(10)
  })
  it('falla con un mensaje claro si no hay nada útil', () => {
    expect(() => sanearConceptos('{"conceptos":[]}', 1000)).toThrow(/Describe un poco más/)
  })
})

describe('sanearAnalisis', () => {
  it('devuelve las tres partes', () => {
    const r = sanearAnalisis('{"summary":"Bien","topPerformers":["Acme",""],"areasForImprovement":["Subir tarifa"]}')
    expect(r).toEqual({ summary: 'Bien', topPerformers: ['Acme'], areasForImprovement: ['Subir tarifa'] })
  })
  it('rechaza un resumen vacío', () => {
    expect(() => sanearAnalisis('{"summary":""}')).toThrow()
  })
})

describe('sanearOrden', () => {
  it('solo ids existentes, sin repetir y en orden', () => {
    expect(sanearOrden('{"ids":["b","x","a","b"]}', ['a', 'b', 'c'])).toEqual(['b', 'a'])
    expect(sanearOrden('["c"]', ['a', 'c'])).toEqual(['c'])
  })
})

describe('costes de las acciones nuevas', () => {
  it.each([
    ['asistente', 1], ['resumirChat', 1], ['generarDocumento', 10], ['generarQuiz', 5],
  ])('"%s" cuesta %i', (accion, esperado) => {
    expect(costeDe(accion)).toBe(esperado)
  })
  it('ordenarArticulos y refinarPropuesta tienen precio', () => {
    expect(costeDe('ordenarArticulos')).toBeGreaterThan(0)
    expect(costeDe('refinarPropuesta')).toBeGreaterThan(0)
  })
})

describe('markdownAHtml', () => {
  it('pinta listas y negrita', () => {
    const h = markdownAHtml('**hola**\n\n- uno\n- dos')
    expect(h).toContain('<strong>hola</strong>')
    expect(h).toContain('<li>uno</li>')
  })
  it('quita scripts, imágenes y manejadores', () => {
    const h = markdownAHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)" onclick="x()">x</a>')
    expect(h).not.toMatch(/<script|<img|onerror|onclick|javascript:/i)
  })
})
